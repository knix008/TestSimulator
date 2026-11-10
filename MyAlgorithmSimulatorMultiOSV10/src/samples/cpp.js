// C++ samples (C++17). Each reads the input box on stdin and prints the result.
const head = `#include <algorithm>\n#include <iostream>\n#include <sstream>\n#include <string>\n#include <vector>\nusing namespace std;\n`;

const sort = (body) => `${head}
int main() {
    string raw((istreambuf_iterator<char>(cin)), {});
    replace(raw.begin(), raw.end(), ',', ' ');
    stringstream in(raw); vector<int> a; int x; while (in >> x) a.push_back(x);
${body}
    for (size_t i = 0; i < a.size(); i++) cout << a[i] << (i + 1 == a.size() ? '\\n' : ' ');
}
`;

function keyed(includes, body) {
  return `${head}${includes}
int main() {
    map<string, string> keys; vector<string> rest; string raw;
    while (getline(cin, raw)) {
        auto hash = raw.find('#'); if (hash != string::npos) raw = raw.substr(0, hash);
        size_t b = raw.find_first_not_of(" \\t"); if (b == string::npos) continue; raw = raw.substr(b);
        size_t c = raw.find(':'); string head = c == string::npos ? "" : raw.substr(0, c);
        bool key = !head.empty() && all_of(head.begin(), head.end(), [](char ch) { return isalpha((unsigned char)ch) || ch == '_'; });
        if (key) { auto v = raw.substr(c + 1); v.erase(0, v.find_first_not_of(" \\t")); keys[head] = v; }
        else rest.push_back(raw);
    }
${body}
}
`;
}

const mapInclude = `#include <cctype>\n#include <map>\n`;

function graph(body, directed = false) {
  return keyed(`${mapInclude}#include <queue>\n#include <tuple>\n#include <numeric>\n`, `    vector<string> names; vector<tuple<int,int,int>> edges;
    auto index = [&](const string& name) { auto it = find(names.begin(), names.end(), name); if (it == names.end()) { names.push_back(name); return (int)names.size() - 1; } return (int)(it - names.begin()); };
    for (auto& line : rest) { stringstream ss(line); string u, v; int w = 1; ss >> u; if (!(ss >> v)) { index(u); continue; } if (ss >> w) {} edges.push_back({index(u), index(v), w}); }
    vector<vector<pair<int,int>>> adj(names.size());
    for (auto [u, v, w] : edges) { adj[u].push_back({v, w}); ${directed ? '' : 'adj[v].push_back({u, w});'} }
${body}`);
}

export const cpp = {
  'bubble-sort': sort(`    for (size_t i = 0; i + 1 < a.size(); i++) { // @1
        bool swapped = false; // @2
        for (size_t j = 0; j + 1 + i < a.size(); j++) { // @3
            if (a[j] > a[j + 1]) { // @4
                swap(a[j], a[j + 1]); // @5
                swapped = true; // @6
            }
        }
        if (!swapped) break; // @7
    }`),
  'selection-sort': sort(`    for (size_t i = 0; i + 1 < a.size(); i++) { size_t m = i;
        for (size_t j = i + 1; j < a.size(); j++) if (a[j] < a[m]) m = j; swap(a[i], a[m]); }`),
  'insertion-sort': sort(`    for (size_t i = 1; i < a.size(); i++) { int key = a[i]; int j = (int)i - 1;
        while (j >= 0 && a[j] > key) { a[j + 1] = a[j]; j--; } a[j + 1] = key; }`),
  'shell-sort': sort(`    for (int gap = (int)a.size() / 2; gap > 0; gap /= 2)
        for (int i = gap; i < (int)a.size(); i++) { int temp = a[i], j = i;
            while (j >= gap && a[j - gap] > temp) { a[j] = a[j - gap]; j -= gap; } a[j] = temp; }`),
  'merge-sort': sort(`    auto mergeSort = [&](auto& self, int lo, int hi) -> void {
        if (lo >= hi) return; int mid = (lo + hi) / 2; self(self, lo, mid); self(self, mid + 1, hi);
        vector<int> merged; int i = lo, j = mid + 1;
        while (i <= mid && j <= hi) merged.push_back(a[i] <= a[j] ? a[i++] : a[j++]);
        while (i <= mid) merged.push_back(a[i++]); while (j <= hi) merged.push_back(a[j++]);
        for (int k = 0; k < (int)merged.size(); k++) a[lo + k] = merged[k]; };
    if (!a.empty()) mergeSort(mergeSort, 0, (int)a.size() - 1);`),
  'quick-sort': sort(`    auto quickSort = [&](auto& self, int lo, int hi) -> void {
        if (lo >= hi) return; int pivot = a[hi], i = lo;
        for (int j = lo; j < hi; j++) if (a[j] < pivot) swap(a[i++], a[j]);
        swap(a[i], a[hi]); self(self, lo, i - 1); self(self, i + 1, hi); };
    if (!a.empty()) quickSort(quickSort, 0, (int)a.size() - 1);`),
  'heap-sort': sort(`    auto sift = [&](auto& self, int i, int size) -> void {
        for (;;) { int l = 2 * i + 1, r = 2 * i + 2, largest = i;
            if (l < size && a[l] > a[largest]) largest = l; if (r < size && a[r] > a[largest]) largest = r;
            if (largest == i) return; swap(a[i], a[largest]); i = largest; } };
    int n = (int)a.size(); for (int i = n / 2 - 1; i >= 0; i--) sift(sift, i, n);
    for (int end = n - 1; end > 0; end--) { swap(a[0], a[end]); sift(sift, 0, end); }`),
  'radix-sort': sort(`    int top = *max_element(a.begin(), a.end());
    for (int exp = 1; top / exp > 0; exp *= 10) { vector<vector<int>> buckets(10);
        for (int v : a) buckets[(v / exp) % 10].push_back(v);
        a.clear(); for (auto& b : buckets) a.insert(a.end(), b.begin(), b.end()); }`),
  'linear-search': `${head}
int main() { string row, targetLine; getline(cin, row); getline(cin, targetLine);
    replace(row.begin(), row.end(), ',', ' '); stringstream in(row); vector<int> a; int x; while (in >> x) a.push_back(x);
    int target = stoi(targetLine.substr(targetLine.find(':') + 1)), found = -1;
    for (int i = 0; i < (int)a.size(); i++) if (a[i] == target) { found = i; break; } cout << found << '\\n'; }
`,
  'binary-search': `${head}
int main() { string row, targetLine; getline(cin, row); getline(cin, targetLine);
    replace(row.begin(), row.end(), ',', ' '); stringstream in(row); vector<int> a; int x; while (in >> x) a.push_back(x);
    sort(a.begin(), a.end()); int target = stoi(targetLine.substr(targetLine.find(':') + 1));
    int lo = 0, hi = (int)a.size() - 1, found = -1;
    while (lo <= hi) { int mid = (lo + hi) / 2; if (a[mid] == target) { found = mid; break; } if (a[mid] < target) lo = mid + 1; else hi = mid - 1; }
    cout << found << '\\n'; }
`,
  bfs: graph(`    int start = (int)(find(names.begin(), names.end(), keys.count("start") ? keys["start"] : names[0]) - names.begin());
    vector<int> seen(names.size()); queue<int> q; q.push(start); seen[start] = 1; vector<string> order;
    while (!q.empty()) { int u = q.front(); q.pop(); order.push_back(names[u]);
        for (auto [v, w] : adj[u]) if (!seen[v]) { seen[v] = 1; q.push(v); } }
    for (size_t i = 0; i < order.size(); i++) cout << order[i] << (i + 1 == order.size() ? '\\n' : ' ');`),
  dfs: graph(`    int start = (int)(find(names.begin(), names.end(), keys.count("start") ? keys["start"] : names[0]) - names.begin());
    vector<int> seen(names.size()); vector<string> order;
    auto visit = [&](auto& self, int u) -> void { seen[u] = 1; order.push_back(names[u]); for (auto [v, w] : adj[u]) if (!seen[v]) self(self, v); };
    visit(visit, start);
    for (size_t i = 0; i < order.size(); i++) cout << order[i] << (i + 1 == order.size() ? '\\n' : ' ');`),
  dijkstra: graph(`    const long long INF = 4e18; int start = (int)(find(names.begin(), names.end(), keys.count("start") ? keys["start"] : names[0]) - names.begin());
    vector<long long> dist(names.size(), INF); dist[start] = 0; vector<int> used(names.size());
    for (size_t round = 0; round < names.size(); round++) { int u = -1;
        for (int i = 0; i < (int)names.size(); i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
        if (dist[u] == INF) break; used[u] = 1; for (auto [v, w] : adj[u]) if (!used[v] && dist[u] + w < dist[v]) dist[v] = dist[u] + w; }
    for (size_t i = 0; i < names.size(); i++) { if (i) cout << ' '; cout << names[i] << '='; if (dist[i] == INF) cout << "INF"; else cout << dist[i]; } cout << '\\n';`),
  'bellman-ford': graph(`    const long long INF = 4e18; int start = (int)(find(names.begin(), names.end(), keys.count("start") ? keys["start"] : names[0]) - names.begin());
    vector<long long> dist(names.size(), INF); dist[start] = 0;
    for (size_t round = 1; round < names.size(); round++) { bool changed = false;
        for (auto [u, v, w] : edges) if (dist[u] != INF && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; changed = true; } if (!changed) break; }
    bool neg = false; for (auto [u, v, w] : edges) if (dist[u] != INF && dist[u] + w < dist[v]) neg = true;
    if (neg) cout << "negative cycle\\n"; else { for (size_t i = 0; i < names.size(); i++) { if (i) cout << ' '; cout << names[i] << '=' << (dist[i] == INF ? "INF" : to_string(dist[i])); } cout << '\\n'; }`, true),
  'floyd-warshall': graph(`    const long long INF = 4e18; int n = (int)names.size(); vector<vector<long long>> d(n, vector<long long>(n, INF));
    for (int i = 0; i < n; i++) d[i][i] = 0; for (auto [u, v, w] : edges) d[u][v] = min(d[u][v], (long long)w);
    for (int k = 0; k < n; k++) for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
    for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) { if (j) cout << ' '; if (d[i][j] > INF / 2) cout << "INF"; else cout << d[i][j]; } cout << '\\n'; }`, true),
  prim: graph(`    const long long INF = 4e18; int start = (int)(find(names.begin(), names.end(), keys.count("start") ? keys["start"] : names[0]) - names.begin());
    vector<long long> key(names.size(), INF); key[start] = 0; vector<int> used(names.size()); long long total = 0;
    for (size_t round = 0; round < names.size(); round++) { int u = -1;
        for (int i = 0; i < (int)names.size(); i++) if (!used[i] && (u < 0 || key[i] < key[u])) u = i;
        if (key[u] == INF) break; used[u] = 1; total += key[u]; for (auto [v, w] : adj[u]) if (!used[v] && w < key[v]) key[v] = w; }
    cout << total << '\\n';`),
  kruskal: graph(`    vector<int> parent(names.size()); iota(parent.begin(), parent.end(), 0);
    auto find = [&](auto& self, int x) -> int { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    sort(edges.begin(), edges.end(), [](auto& p, auto& q) { return get<2>(p) < get<2>(q); }); long long total = 0;
    for (auto [u, v, w] : edges) { int ru = find(find, u), rv = find(find, v); if (ru != rv) { parent[ru] = rv; total += w; } }
    cout << total << '\\n';`),
  'topological-sort': graph(`    vector<int> indeg(names.size()); for (auto [u, v, w] : edges) indeg[v]++;
    queue<int> q; for (int i = 0; i < (int)names.size(); i++) if (!indeg[i]) q.push(i); vector<string> order;
    while (!q.empty()) { int u = q.front(); q.pop(); order.push_back(names[u]); for (auto [v, w] : adj[u]) if (--indeg[v] == 0) q.push(v); }
    if (order.size() != names.size()) cout << "cycle\\n"; else for (size_t i = 0; i < order.size(); i++) cout << order[i] << (i + 1 == order.size() ? '\\n' : ' ');`, true),
  astar: `${head}#include <set>\n
int main() { vector<string> rows; string line; while (getline(cin, line)) { if (!line.empty() && line.back() == '\\r') line.pop_back(); if (!line.empty()) rows.push_back(line); }
    int cols = (int)rows[0].size(), start = -1, goal = -1; set<int> walls;
    for (int r = 0; r < (int)rows.size(); r++) for (int c = 0; c < cols; c++) { int i = r * cols + c; char ch = rows[r][c]; if (ch == 'S' || ch == 's') start = i; else if (ch == 'G' || ch == 'g') goal = i; else if (ch == '#') walls.insert(i); }
    auto h = [&](int i) { return abs(i / cols - goal / cols) + abs(i % cols - goal % cols); };
    vector<int> g(rows.size() * cols, 1e9); g[start] = 0; vector<int> open = {start}; set<int> closed; string answer = "none";
    while (!open.empty()) { int best = 0; for (int k = 1; k < (int)open.size(); k++) if (g[open[k]] + h(open[k]) < g[open[best]] + h(open[best]) || (g[open[k]] + h(open[k]) == g[open[best]] + h(open[best]) && h(open[k]) < h(open[best]))) best = k;
        int u = open[best]; if (u == goal) { answer = to_string(g[u]); break; } open.erase(open.begin() + best); closed.insert(u);
        int r = u / cols, c = u % cols; int dr[4] = {-1, 0, 1, 0}, dc[4] = {0, 1, 0, -1};
        for (int k = 0; k < 4; k++) { int vr = r + dr[k], vc = c + dc[k]; if (vr < 0 || vc < 0 || vr >= (int)rows.size() || vc >= cols) continue; int v = vr * cols + vc; if (walls.count(v) || closed.count(v)) continue; if (g[u] + 1 < g[v]) { g[v] = g[u] + 1; if (!count(open.begin(), open.end(), v)) open.push_back(v); } } }
    cout << answer << '\\n'; }
`,
  fibonacci: `${head}
int main() { string line; getline(cin, line); int n = stoi(line.substr(line.find(':') + 1));
    vector<unsigned long long> f = {0, 1}; for (int i = 2; i <= n; i++) f.push_back(f[i - 1] + f[i - 2]); cout << f[n] << '\\n'; }
`,
  knapsack: keyed(mapInclude, `    auto nums = [&](string s) { replace(s.begin(), s.end(), ',', ' '); stringstream in(s); vector<int> o; int x; while (in >> x) o.push_back(x); return o; };
    auto w = nums(keys["weights"]), v = nums(keys["values"]); int cap = stoi(keys["capacity"]), n = (int)w.size();
    vector<vector<int>> k(n + 1, vector<int>(cap + 1));
    for (int i = 1; i <= n; i++) for (int c = 0; c <= cap; c++) { k[i][c] = k[i - 1][c]; if (w[i - 1] <= c) k[i][c] = max(k[i][c], k[i - 1][c - w[i - 1]] + v[i - 1]); }
    cout << k[n][cap] << '\\n';`),
  lcs: keyed(mapInclude, `    string x = keys["a"], y = keys["b"]; int m = (int)x.size(), n = (int)y.size();
    vector<vector<int>> c(m + 1, vector<int>(n + 1));
    for (int i = 1; i <= m; i++) for (int j = 1; j <= n; j++) c[i][j] = x[i - 1] == y[j - 1] ? c[i - 1][j - 1] + 1 : max(c[i - 1][j], c[i][j - 1]);
    string s; int i = m, j = n; while (i && j) { if (x[i - 1] == y[j - 1]) { s = x[i - 1] + s; i--; j--; } else if (c[i - 1][j] >= c[i][j - 1]) i--; else j--; }
    cout << s << '\\n';`),
  'edit-distance': keyed(mapInclude, `    string a = keys["a"], b = keys["b"]; int m = (int)a.size(), n = (int)b.size();
    vector<vector<int>> d(m + 1, vector<int>(n + 1));
    for (int i = 0; i <= m; i++) d[i][0] = i; for (int j = 0; j <= n; j++) d[0][j] = j;
    for (int i = 1; i <= m; i++) for (int j = 1; j <= n; j++) d[i][j] = a[i - 1] == b[j - 1] ? d[i - 1][j - 1] : 1 + min({d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]});
    cout << d[m][n] << '\\n';`),
  kmp: keyed(mapInclude, `    string t = keys["text"], p = keys["pattern"]; int m = (int)p.size(), n = (int)t.size(); vector<int> lps(m); int length = 0, k = 1;
    while (k < m) { if (p[k] == p[length]) lps[k++] = ++length; else if (length) length = lps[length - 1]; else lps[k++] = 0; }
    vector<int> found; int i = 0, j = 0;
    while (i < n) { if (t[i] == p[j]) { i++; j++; if (j == m) { found.push_back(i - m); j = lps[j - 1]; } } else if (j) j = lps[j - 1]; else i++; }
    if (found.empty()) cout << "none\\n"; else for (size_t z = 0; z < found.size(); z++) cout << found[z] << (z + 1 == found.size() ? '\\n' : ' ');`),
  'rabin-karp': keyed(mapInclude, `    string t = keys["text"], p = keys["pattern"]; int d = 256, q = 101, m = (int)p.size(), n = (int)t.size(), h = 1;
    for (int k = 0; k < m - 1; k++) h = (h * d) % q; int ph = 0, th = 0;
    for (int k = 0; k < m; k++) { ph = (d * ph + (unsigned char)p[k]) % q; th = (d * th + (unsigned char)t[k]) % q; }
    vector<int> found;
    for (int s = 0; s <= n - m; s++) { if (ph == th && t.substr(s, m) == p) found.push_back(s);
        if (s < n - m) { th = (d * (th - (unsigned char)t[s] * h) + (unsigned char)t[s + m]) % q; if (th < 0) th += q; } }
    if (found.empty()) cout << "none\\n"; else for (size_t z = 0; z < found.size(); z++) cout << found[z] << (z + 1 == found.size() ? '\\n' : ' ');`),
  bst: keyed(mapInclude, `    stringstream ss(rest[0]); string token; vector<int> values;
    while (ss >> token) { replace(token.begin(), token.end(), ',', ' '); stringstream one(token); int x; while (one >> x) values.push_back(x); }
    int target = stoi(keys["search"]); struct Node { int key, left = -1, right = -1; }; vector<Node> nodes; int root = -1;
    for (int key : values) { if (root < 0) { nodes.push_back({key}); root = 0; continue; } int cur = root;
        for (;;) { if (key == nodes[cur].key) break; bool left = key < nodes[cur].key; int next = left ? nodes[cur].left : nodes[cur].right; if (next < 0) { nodes.push_back({key}); (left ? nodes[cur].left : nodes[cur].right) = (int)nodes.size() - 1; break; } cur = next; } }
    int cur = root; string answer = "not found";
    while (cur >= 0) { if (target == nodes[cur].key) { answer = "found"; break; } cur = target < nodes[cur].key ? nodes[cur].left : nodes[cur].right; }
    cout << answer << '\\n';`),
  'tree-traversal': keyed(`${mapInclude}#include <queue>\n`, `    stringstream ss; for (auto& line : rest) ss << line << ' '; string token; vector<int> values;
    while (ss >> token) { replace(token.begin(), token.end(), ',', ' '); stringstream one(token); int x; while (one >> x) values.push_back(x); }
    struct Node { int key, left = -1, right = -1; }; vector<Node> nodes; int root = -1;
    for (int key : values) { if (root < 0) { nodes.push_back({key}); root = 0; continue; } int cur = root;
        for (;;) { if (key == nodes[cur].key) break; bool left = key < nodes[cur].key; int next = left ? nodes[cur].left : nodes[cur].right; if (next < 0) { nodes.push_back({key}); (left ? nodes[cur].left : nodes[cur].right) = (int)nodes.size() - 1; break; } cur = next; } }
    auto show = [](const vector<int>& o) { for (size_t i = 0; i < o.size(); i++) cout << o[i] << (i + 1 == o.size() ? '\\n' : ' '); };
    auto walk = [&](auto& self, int cur, int order, vector<int>& out) -> void { if (cur < 0) return; if (order == 0) out.push_back(nodes[cur].key); self(self, nodes[cur].left, order, out); if (order == 1) out.push_back(nodes[cur].key); self(self, nodes[cur].right, order, out); if (order == 2) out.push_back(nodes[cur].key); };
    for (int order = 0; order < 3; order++) { vector<int> out; walk(walk, root, order, out); show(out); }
    queue<int> q; q.push(root); vector<int> level; while (!q.empty()) { int cur = q.front(); q.pop(); level.push_back(nodes[cur].key); if (nodes[cur].left >= 0) q.push(nodes[cur].left); if (nodes[cur].right >= 0) q.push(nodes[cur].right); } show(level);`),
  'n-queens': keyed(mapInclude, `    int n = stoi(keys.count("n") ? keys["n"] : rest[0]); string mode = keys.count("mode") ? keys["mode"] : "first";
    for (auto& ch : mode) ch = tolower((unsigned char)ch); vector<int> queens(n, -1); vector<vector<int>> solutions;
    auto safe = [&](int row, int col) { for (int r = 0; r < row; r++) if (queens[r] == col || abs(queens[r] - col) == row - r) return false; return true; };
    auto solve = [&](auto& self, int row) -> bool { if (row == n) { solutions.push_back(queens); return mode == "first" ? false : true; }
        for (int col = 0; col < n; col++) if (safe(row, col)) { queens[row] = col; if (!self(self, row + 1)) return false; } return true; };
    solve(solve, 0);
    if (mode == "all") cout << solutions.size() << '\\n'; else if (solutions.empty()) cout << "none\\n"; else for (int i = 0; i < n; i++) cout << solutions[0][i] << (i + 1 == n ? '\\n' : ' ');`),
  gcd: keyed(mapInclude, `    int a = stoi(keys["a"]), b = stoi(keys["b"]); while (b) { int r = a % b; a = b; b = r; } cout << a << '\\n';`),
  sieve: keyed(mapInclude, `    int n = stoi(keys["n"]); vector<char> prime(n + 1, 1); prime[0] = prime[1] = 0;
    for (int p = 2; p * p <= n; p++) if (prime[p]) for (int m = p * p; m <= n; m += p) prime[m] = 0;
    bool first = true; for (int p = 2; p <= n; p++) if (prime[p]) { if (!first) cout << ' '; cout << p; first = false; } cout << '\\n';`),
  hanoi: keyed(mapInclude, `    int n = stoi(keys["n"]); cout << ((1LL << n) - 1) << '\\n';`),
};
