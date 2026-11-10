// cpp samples for the classroom algorithms (src/algorithms/classroom.js).
// Each program reads the input box on stdin and prints exactly expectedOutput().

const head = String.raw`#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <iterator>
#include <map>
#include <sstream>
#include <string>
#include <vector>
using namespace std;

string trim(const string& s) {
    size_t b = s.find_first_not_of(" \t\r\n");
    if (b == string::npos) return "";
    size_t e = s.find_last_not_of(" \t\r\n");
    return s.substr(b, e - b + 1);
}

// Integers separated by spaces or commas.
vector<int> numbers(string s) {
    for (char& ch : s) if (ch == ',' || ch == ';') ch = ' ';
    stringstream in(s);
    vector<int> out;
    int x;
    while (in >> x) out.push_back(x);
    return out;
}
`;

// "key: value" lines (keys lower-case, # starts a comment).
const keyed = String.raw`
map<string, string> readKeys(const string& text) {
    map<string, string> keys;
    stringstream in(text);
    string line;
    while (getline(in, line)) {
        line = trim(line.substr(0, line.find('#')));
        size_t colon = line.find_first_of(":=");
        if (colon == string::npos || colon == 0) continue;
        string name = trim(line.substr(0, colon));
        bool ok = !name.empty();
        for (char& ch : name) { if (!isalpha((unsigned char)ch) && ch != '_') ok = false; ch = (char)tolower((unsigned char)ch); }
        if (ok) keys[name] = trim(line.substr(colon + 1));
    }
    return keys;
}

string readAll() {
    return string((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
}
`;

// A grid of S G # . and the neighbours of a cell (up, right, down, left).
const grid = String.raw`
struct Grid {
    int rows = 0, cols = 0, start = -1, goal = -1;
    vector<bool> wall;

    vector<int> neighbours(int u) const {
        int r = u / cols, c = u % cols;
        vector<int> out;
        if (r > 0) out.push_back(u - cols);
        if (c + 1 < cols) out.push_back(u + 1);
        if (r + 1 < rows) out.push_back(u + cols);
        if (c > 0) out.push_back(u - 1);
        return out;
    }
};

Grid readGrid() {
    vector<string> lines;
    string line;
    while (getline(cin, line)) {
        line = trim(line);
        if (!line.empty()) lines.push_back(line);
    }
    Grid g;
    g.rows = (int)lines.size();
    g.cols = (int)lines[0].size();
    g.wall.assign(g.rows * g.cols, false);
    for (int r = 0; r < g.rows; r++)
        for (int c = 0; c < g.cols; c++) {
            char ch = lines[r][c];
            int i = r * g.cols + c;
            if (ch == 'S' || ch == 's') g.start = i;
            else if (ch == 'G' || ch == 'g') g.goal = i;
            else if (ch == '#') g.wall[i] = true;
        }
    return g;
}

// Number of moves from the start to the goal following parent links.
int pathLength(const vector<int>& parent, int start, int goal) {
    int length = 0;
    for (int x = goal; x != start; x = parent[x]) length++;
    return length;
}
`;

const join = String.raw`
template <typename T>
string join(const vector<T>& items) {
    string out;
    for (size_t i = 0; i < items.size(); i++) {
        if (i) out += ' ';
        ostringstream s; s << items[i]; out += s.str();
    }
    return out;
}
`;

export const cpp = {
  'grid-bfs': String.raw`${head}${grid}
int main() {
    Grid g = readGrid();
    vector<int> dist(g.rows * g.cols, -1);   // -1 = not seen yet
    vector<int> queue;
    dist[g.start] = 0; queue.push_back(g.start); // @1
    for (size_t head = 0; head < queue.size(); ) { // @2
        int u = queue[head++]; // @3
        if (u == g.goal) { cout << dist[u] << '\n'; return 0; } // @4
        for (int v : g.neighbours(u)) { // @5
            if (g.wall[v] || dist[v] >= 0) continue; // @6
            dist[v] = dist[u] + 1; queue.push_back(v); // @7
        }
    }
    cout << "none\n"; // @8
}
`,

  'greedy-best-first': String.raw`${head}${grid}
int main() {
    Grid g = readGrid();
    auto h = [&](int i) { return abs(i / g.cols - g.goal / g.cols) + abs(i % g.cols - g.goal % g.cols); };
    vector<int> parent(g.rows * g.cols, -1);
    vector<bool> seen(g.rows * g.cols, false);
    vector<int> open = {g.start}; seen[g.start] = true; // @1
    while (!open.empty()) { // @2
        size_t best = 0;   // smallest h; the earliest added wins a tie
        for (size_t k = 1; k < open.size(); k++) if (h(open[k]) < h(open[best])) best = k; // @3
        int u = open[best];
        if (u == g.goal) { cout << pathLength(parent, g.start, g.goal) << '\n'; return 0; } // @4
        open.erase(open.begin() + best); // @5
        for (int v : g.neighbours(u)) { // @6
            if (g.wall[v] || seen[v]) continue;
            seen[v] = true; parent[v] = u; open.push_back(v); // @7
        }
    }
    cout << "none\n"; // @8
}
`,

  'maze-dfs': String.raw`${head}${grid}
Grid g;
vector<int> parent;
vector<bool> visited;

bool dfs(int u) { // @0
    if (u == g.goal) return true; // @1
    visited[u] = true; // @2
    for (int v : g.neighbours(u)) { // @3
        if (g.wall[v] || visited[v]) continue; // @4
        parent[v] = u; // @5
        if (dfs(v)) return true; // @6
    }
    return false;   // dead end: back up // @7
}

int main() {
    g = readGrid();
    parent.assign(g.rows * g.cols, -1);
    visited.assign(g.rows * g.cols, false);
    if (dfs(g.start)) cout << pathLength(parent, g.start, g.goal) << '\n';
    else cout << "none\n";
}
`,

  'subset-sum': String.raw`${head}${keyed}${join}
vector<int> a;
vector<bool> taken;
int target;

bool solve(size_t i, int sum) { // @0
    if (sum == target) return true;   // found a subset // @1
    if (i == a.size()) return false; // @2
    if (sum + a[i] <= target) { // @3
        taken[i] = true;
        if (solve(i + 1, sum + a[i])) return true; // @4
        taken[i] = false;   // put a[i] back // @5
    }
    return solve(i + 1, sum);   // skip a[i] // @6
}

int main() {
    auto keys = readKeys(readAll());
    a = numbers(keys["values"]);
    target = atoi(keys["target"].c_str());
    taken.assign(a.size(), false);
    if (!solve(0, 0)) { cout << "none\n"; return 0; }
    vector<int> chosen;
    for (size_t i = 0; i < a.size(); i++) if (taken[i]) chosen.push_back(a[i]);
    cout << join(chosen) << '\n';
}
`,

  permutations: String.raw`${head}${keyed}${join}
vector<int> items, cur;
vector<bool> used;

void permute() { // @0
    if (cur.size() == items.size()) { cout << join(cur) << '\n'; return; } // @1
    for (size_t i = 0; i < items.size(); i++) { // @2
        if (used[i]) continue; // @3
        used[i] = true; cur.push_back(items[i]); // @4
        permute(); // @5
        cur.pop_back(); used[i] = false;   // backtrack // @6
    }
}

int main() {
    string text = readAll();
    auto keys = readKeys(text);
    items = numbers(keys.count("items") ? keys["items"] : text);
    used.assign(items.size(), false);
    permute();
}
`,

  sudoku: String.raw`${head}
int grid[81];   // 0 = empty

// Can digit d go in cell i? (cell i itself is not counted)
bool allowed(int i, int d) {
    int r = i / 9, c = i % 9;
    for (int k = 0; k < 9; k++) {
        if (r * 9 + k != i && grid[r * 9 + k] == d) return false;
        if (k * 9 + c != i && grid[k * 9 + c] == d) return false;
    }
    int br = r - r % 3, bc = c - c % 3;
    for (int y = br; y < br + 3; y++)
        for (int x = bc; x < bc + 3; x++)
            if (y * 9 + x != i && grid[y * 9 + x] == d) return false;
    return true;
}

bool solve() { // @0
    int i = 0;
    while (i < 81 && grid[i]) i++;
    if (i == 81) return true;   // no empty cell left // @1
    for (int d = 1; d <= 9; d++) { // @2
        if (!allowed(i, d)) continue; // @3
        grid[i] = d; // @4
        if (solve()) return true; // @5
        grid[i] = 0;   // backtrack // @6
    }
    return false; // @7
}

int main() {
    int count = 0;
    char ch;
    while (count < 81 && cin.get(ch)) {
        if (isspace((unsigned char)ch) || ch == '|' || ch == '+' || ch == '-') continue;
        grid[count++] = ch >= '1' && ch <= '9' ? ch - '0' : 0;
    }
    bool clash = false;   // the givens must not repeat in a row, column or box
    for (int i = 0; i < 81; i++) if (grid[i] && !allowed(i, grid[i])) clash = true;
    if (clash || !solve()) { cout << "none\n"; return 0; }
    for (int r = 0; r < 9; r++) {
        for (int c = 0; c < 9; c++) cout << grid[r * 9 + c];
        cout << '\n';
    }
}
`,

  huffman: String.raw`${head}${keyed}
#include <queue>

int main() {
    string text = readAll();
    auto keys = readKeys(text);
    string word = keys.count("text") ? keys["text"] : trim(text);
    map<char, int> freq;
    for (char ch : word) freq[ch]++; // @1
    // Nodes 0..k-1 are leaves; parent[] links each tree to the node that joined it.
    vector<int> weight, parent;
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;   // (freq, node)
    for (auto [ch, f] : freq) { // @2
        pq.push({f, (int)weight.size()});
        weight.push_back(f); parent.push_back(-1);
    }
    size_t leaves = weight.size();
    while (pq.size() > 1) { // @3
        auto [fx, x] = pq.top(); pq.pop(); // @4
        auto [fy, y] = pq.top(); pq.pop();
        int z = (int)weight.size(); // @5
        weight.push_back(fx + fy); parent.push_back(-1);
        parent[x] = parent[y] = z;
        pq.push({fx + fy, z}); // @6
    }
    long long bits = 0;
    for (size_t leaf = 0; leaf < leaves; leaf++) {
        int length = 0;   // code length = number of edges up to the root // @7
        for (int x = (int)leaf; parent[x] >= 0; x = parent[x]) length++;
        if (length == 0) length = 1;   // a single symbol still needs 1 bit
        bits += (long long)weight[leaf] * length; // @8
    }
    cout << bits << '\n';
}
`,

  'fractional-knapsack': String.raw`${head}${keyed}
#include <iomanip>

int main() {
    auto keys = readKeys(readAll());
    vector<int> w = numbers(keys["weights"]), v = numbers(keys["values"]);
    int room = atoi(keys["capacity"].c_str());
    vector<int> order(w.size());
    for (size_t i = 0; i < order.size(); i++) order[i] = (int)i;
    // largest value per weight first: compare v[a]/w[a] and v[b]/w[b] by cross-multiplying
    stable_sort(order.begin(), order.end(), [&](int a, int b) { return (long long)v[a] * w[b] > (long long)v[b] * w[a]; }); // @1
    long long num = 0, den = 1;   // the total value is num / den, kept exact
    for (int i : order) { // @2
        if (room == 0) break;
        if (w[i] <= room) { room -= w[i]; num += v[i] * den; } // @3
        else { // @4
            num = num * w[i] + (long long)v[i] * room * den;
            den *= w[i];
            room = 0;
        }
    }
    // round half up to 2 decimals with integers only
    long long cents = (2 * 100 * num + den) / (2 * den);
    cout << cents / 100 << '.' << setw(2) << setfill('0') << cents % 100 << '\n'; // @5
}
`,

  'job-sequencing': String.raw`${head}${join}
int main() {
    vector<int> deadline, profit;
    string line;
    while (getline(cin, line)) {
        vector<int> nums = numbers(line);
        if (nums.size() < 2) continue;
        deadline.push_back(nums[0]); profit.push_back(nums[1]);
    }
    int n = (int)deadline.size();
    int slots = *max_element(deadline.begin(), deadline.end());
    vector<int> order(n);
    for (int i = 0; i < n; i++) order[i] = i;
    stable_sort(order.begin(), order.end(), [&](int a, int b) { return profit[a] > profit[b]; }); // @1
    vector<int> slot(slots + 1, -1);
    int total = 0;
    for (int j : order) { // @2
        for (int t = min(deadline[j], slots); t >= 1; t--) { // @3
            if (slot[t] < 0) { slot[t] = j; total += profit[j]; break; } // @4
        }
    }
    vector<string> sequence;
    for (int t = 1; t <= slots; t++) if (slot[t] >= 0) sequence.push_back("J" + to_string(slot[t] + 1)); // @6
    cout << join(sequence) << '\n' << total << '\n';
}
`,

  'avl-tree': String.raw`${head}${keyed}${join}
struct Node {
    int key, height = 1;
    Node *left = nullptr, *right = nullptr;
    Node(int k) : key(k) {}
};

int height(Node* n) { return n ? n->height : 0; }
void update(Node* n) { n->height = 1 + max(height(n->left), height(n->right)); }

Node* rotateRight(Node* n) {
    Node* x = n->left;
    n->left = x->right; x->right = n;
    update(n); update(x);
    return x;
}

Node* rotateLeft(Node* n) {
    Node* x = n->right;
    n->right = x->left; x->left = n;
    update(n); update(x);
    return x;
}

Node* insert(Node* node, int key) { // @0
    if (!node) return new Node(key); // @1
    if (key < node->key) node->left = insert(node->left, key); // @2
    else if (key > node->key) node->right = insert(node->right, key); // @3
    else return node;   // duplicate // @4
    update(node);
    int b = height(node->left) - height(node->right); // @5
    if (b > 1 && key < node->left->key) return rotateRight(node); // @6
    if (b < -1 && key > node->right->key) return rotateLeft(node); // @7
    if (b > 1) { node->left = rotateLeft(node->left); return rotateRight(node); } // @8
    if (b < -1) { node->right = rotateRight(node->right); return rotateLeft(node); } // @9
    return node; // @10
}

void preorder(Node* n, vector<int>& out) {
    if (!n) return;
    out.push_back(n->key);
    preorder(n->left, out);
    preorder(n->right, out);
}

int main() {
    string text = readAll();
    auto keys = readKeys(text);
    Node* root = nullptr;
    for (int key : numbers(keys.count("values") ? keys["values"] : text)) root = insert(root, key);
    vector<int> out;
    preorder(root, out);
    cout << join(out) << '\n';
}
`,

  'binary-heap': String.raw`${head}${keyed}${join}
vector<int> a;
int n = 0;   // heap size (a[n..] holds the extracted values)

void insert(int x) { // @0
    a.push_back(x); int i = n; n++; // @1
    while (i > 0 && a[(i - 1) / 2] > a[i]) { // @2
        swap(a[i], a[(i - 1) / 2]); i = (i - 1) / 2; // @3
    }
}

int extractMin() { // @4
    int min = a[0];
    swap(a[0], a[n - 1]); n--; // @5
    int i = 0;
    for (;;) { // @6
        int c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && a[c + 1] < a[c]) c = c + 1;   // the smaller child
        if (a[c] >= a[i]) break;
        swap(a[i], a[c]); i = c; // @7
    }
    return min; // @8
}

int main() {
    string text = readAll();
    auto keys = readKeys(text);
    for (int x : numbers(keys.count("values") ? keys["values"] : text)) insert(x);
    int extract = keys.count("extract") ? atoi(keys["extract"].c_str()) : 1;
    cout << join(a) << '\n';
    vector<int> out;
    for (int k = 0; k < extract; k++) out.push_back(extractMin());
    cout << join(out) << '\n';
}
`,

  trie: String.raw`${head}${keyed}${join}
struct Node {
    Node* child[26] = {};
    bool end = false;
};

Node root;

void insert(const string& word) { // @0
    Node* node = &root; // @1
    for (char ch : word) { // @2
        int c = ch - 'a';
        if (!node->child[c]) node->child[c] = new Node(); // @3
        node = node->child[c]; // @4
    }
    node->end = true; // @5
}

// Every word below node, in alphabetical order.
void collect(Node* node, string& word, vector<string>& out) {
    if (node->end) out.push_back(word);
    for (int c = 0; c < 26; c++) if (node->child[c]) {
        word.push_back((char)('a' + c));
        collect(node->child[c], word, out);
        word.pop_back();
    }
}

int main() {
    auto keys = readKeys(readAll());
    string words = keys["words"];
    for (char& ch : words) if (ch == ',') ch = ' ';
    stringstream in(words);
    string w;
    while (in >> w) insert(w);
    string prefix = keys["find"];
    Node* node = &root;
    for (char ch : prefix) { // @7
        node = node->child[ch - 'a'];
        if (!node) { cout << "none\n"; return 0; }
    }
    vector<string> found;
    collect(node, prefix, found); // @8
    cout << (found.empty() ? "none" : join(found)) << '\n';
}
`,
};
