// c samples for the classroom algorithms (src/algorithms/classroom.js).
// Each program reads the input box on stdin and prints exactly expectedOutput().

// Reading stdin, "key: value" lines and lists of integers.
const io = String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Read the whole of stdin into one string. */
static char *read_all(void) {
    size_t cap = 4096, n = 0;
    char *buf = malloc(cap);
    int ch;
    while ((ch = getchar()) != EOF) {
        if (n + 2 >= cap) { cap *= 2; buf = realloc(buf, cap); }
        buf[n++] = (char)ch;
    }
    buf[n] = '\0';
    return buf;
}

/* Remove spaces at both ends of s (in place). */
static char *trim(char *s) {
    while (*s && isspace((unsigned char)*s)) s++;
    size_t len = strlen(s);
    while (len && isspace((unsigned char)s[len - 1])) s[--len] = '\0';
    return s;
}

#define MAX_KEYS 16
#define VALUE_LEN 1024
static char key_name[MAX_KEYS][32];
static char key_value[MAX_KEYS][VALUE_LEN];
static int nkeys;

/* Collect "key: value" lines. # starts a comment, keys are lower-cased. */
static void parse_keyed(const char *text) {
    char line[VALUE_LEN];
    nkeys = 0;
    while (*text) {
        size_t len = 0;
        while (*text && *text != '\n') { if (len + 1 < sizeof line) line[len++] = *text; text++; }
        if (*text == '\n') text++;
        line[len] = '\0';
        char *hash = strchr(line, '#');
        if (hash) *hash = '\0';
        char *s = trim(line);
        char *colon = strpbrk(s, ":=");
        if (!colon || colon == s || nkeys >= MAX_KEYS) continue;
        *colon = '\0';
        char *name = trim(s);
        int ok = *name != '\0';
        for (char *p = name; *p; p++) if (!isalpha((unsigned char)*p) && *p != '_') ok = 0;
        if (!ok) continue;
        int k = 0;
        for (; name[k] && k < 31; k++) key_name[nkeys][k] = (char)tolower((unsigned char)name[k]);
        key_name[nkeys][k] = '\0';
        strcpy(key_value[nkeys], trim(colon + 1));
        nkeys++;
    }
}

/* The value of a key, or NULL when the line is missing. */
static const char *key_of(const char *name) {
    for (int i = 0; i < nkeys; i++) if (strcmp(key_name[i], name) == 0) return key_value[i];
    return NULL;
}

/* Integers separated by spaces or commas. Returns how many were read. */
static int parse_ints(const char *s, int *out, int cap) {
    int n = 0;
    while (*s && n < cap) {
        if (*s != '-' && !isdigit((unsigned char)*s)) { s++; continue; }
        char *end = NULL;
        long v = strtol(s, &end, 10);
        if (end == s) { s++; continue; }
        out[n++] = (int)v;
        s = end;
    }
    return n;
}
`;

// Reading a grid of S G # . and listing the neighbours of a cell.
const grid = String.raw`
#define MAX_CELLS 960   /* up to 24 rows x 40 columns */
static int rows, cols, start, goal;
static char wall[MAX_CELLS];

static void read_grid(void) {
    char line[256];
    rows = cols = 0;
    start = goal = -1;
    while (fgets(line, sizeof line, stdin)) {
        char *s = trim(line);
        int len = (int)strlen(s);
        if (!len || rows >= 24) continue;
        if (!rows) cols = len > 40 ? 40 : len;
        for (int c = 0; c < cols && c < len; c++) {
            int i = rows * cols + c;
            if (s[c] == 'S' || s[c] == 's') start = i;
            else if (s[c] == 'G' || s[c] == 'g') goal = i;
            else if (s[c] == '#') wall[i] = 1;
        }
        rows++;
    }
}

/* Neighbours of cell u in the order up, right, down, left. */
static int neighbours(int u, int out[4]) {
    int r = u / cols, c = u % cols, n = 0;
    if (r > 0) out[n++] = u - cols;
    if (c + 1 < cols) out[n++] = u + 1;
    if (r + 1 < rows) out[n++] = u + cols;
    if (c > 0) out[n++] = u - 1;
    return n;
}
`;

export const c = {
  'grid-bfs': String.raw`${io}${grid}
int main(void) {
    read_grid();
    int dist[MAX_CELLS], queue[MAX_CELLS], head = 0, tail = 0;
    for (int i = 0; i < rows * cols; i++) dist[i] = -1;   /* -1 = not seen yet */
    dist[start] = 0; queue[tail++] = start; // @1
    while (head < tail) { // @2
        int u = queue[head++]; // @3
        if (u == goal) { printf("%d\n", dist[u]); return 0; } // @4
        int next[4], count = neighbours(u, next);
        for (int k = 0; k < count; k++) { // @5
            int v = next[k];
            if (wall[v] || dist[v] >= 0) continue; // @6
            dist[v] = dist[u] + 1; queue[tail++] = v; // @7
        }
    }
    printf("none\n"); // @8
    return 0;
}
`,

  'greedy-best-first': String.raw`${io}${grid}
/* h = Manhattan distance from cell i to the goal */
static int h(int i) {
    return abs(i / cols - goal / cols) + abs(i % cols - goal % cols);
}

int main(void) {
    read_grid();
    int parent[MAX_CELLS], open[MAX_CELLS], nopen = 0;
    char seen[MAX_CELLS] = {0};
    for (int i = 0; i < rows * cols; i++) parent[i] = -1;
    open[nopen++] = start; seen[start] = 1; // @1
    while (nopen > 0) { // @2
        int best = 0;   /* smallest h; the earliest added wins a tie */
        for (int k = 1; k < nopen; k++) if (h(open[k]) < h(open[best])) best = k; // @3
        int u = open[best];
        if (u == goal) { // @4
            int length = 0;
            for (int x = goal; x != start; x = parent[x]) length++;
            printf("%d\n", length);
            return 0;
        }
        for (int k = best; k + 1 < nopen; k++) open[k] = open[k + 1]; // @5
        nopen--;
        int next[4], count = neighbours(u, next);
        for (int k = 0; k < count; k++) { // @6
            int v = next[k];
            if (wall[v] || seen[v]) continue;
            seen[v] = 1; parent[v] = u; open[nopen++] = v; // @7
        }
    }
    printf("none\n"); // @8
    return 0;
}
`,

  'maze-dfs': String.raw`${io}${grid}
static int parent[MAX_CELLS];
static char visited[MAX_CELLS];

static int dfs(int u) { // @0
    if (u == goal) return 1; // @1
    visited[u] = 1; // @2
    int next[4], count = neighbours(u, next);
    for (int k = 0; k < count; k++) { // @3
        int v = next[k];
        if (wall[v] || visited[v]) continue; // @4
        parent[v] = u; // @5
        if (dfs(v)) return 1; // @6
    }
    return 0;   /* dead end: back up */ // @7
}

int main(void) {
    read_grid();
    for (int i = 0; i < rows * cols; i++) parent[i] = -1;
    if (!dfs(start)) { printf("none\n"); return 0; }
    int length = 0;
    for (int x = goal; x != start; x = parent[x]) length++;
    printf("%d\n", length);
    return 0;
}
`,

  'subset-sum': String.raw`${io}
static int a[64], taken[64], n, target;

static int solve(int i, int sum) { // @0
    if (sum == target) return 1;   /* found a subset */ // @1
    if (i == n) return 0; // @2
    if (sum + a[i] <= target) { // @3
        taken[i] = 1;
        if (solve(i + 1, sum + a[i])) return 1; // @4
        taken[i] = 0;   /* put a[i] back */ // @5
    }
    return solve(i + 1, sum);   /* skip a[i] */ // @6
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    const char *values = key_of("values"), *t = key_of("target");
    n = parse_ints(values ? values : "", a, 64);
    target = t ? atoi(t) : 0;
    if (!solve(0, 0)) { printf("none\n"); return 0; }
    int first = 1;
    for (int i = 0; i < n; i++) if (taken[i]) { printf(first ? "%d" : " %d", a[i]); first = 0; }
    printf("\n");
    free(text);
    return 0;
}
`,

  permutations: String.raw`${io}
static int items[8], used[8], cur[8], n, len;

static void permute(void) { // @0
    if (len == n) { // @1
        for (int k = 0; k < n; k++) printf(k ? " %d" : "%d", cur[k]);
        printf("\n");
        return;
    }
    for (int i = 0; i < n; i++) { // @2
        if (used[i]) continue; // @3
        used[i] = 1; cur[len++] = items[i]; // @4
        permute(); // @5
        len--; used[i] = 0;   /* backtrack */ // @6
    }
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    const char *list = key_of("items");
    n = parse_ints(list ? list : text, items, 8);
    permute();
    free(text);
    return 0;
}
`,

  sudoku: String.raw`${io}
static int grid[81];   /* 0 = empty */

/* Can digit d go in cell i? (cell i itself is not counted) */
static int allowed(int i, int d) {
    int r = i / 9, c = i % 9;
    for (int k = 0; k < 9; k++) {
        if (r * 9 + k != i && grid[r * 9 + k] == d) return 0;
        if (k * 9 + c != i && grid[k * 9 + c] == d) return 0;
    }
    int br = r - r % 3, bc = c - c % 3;
    for (int y = br; y < br + 3; y++)
        for (int x = bc; x < bc + 3; x++)
            if (y * 9 + x != i && grid[y * 9 + x] == d) return 0;
    return 1;
}

static int solve(void) { // @0
    int i = 0;
    while (i < 81 && grid[i]) i++;
    if (i == 81) return 1;   /* no empty cell left */ // @1
    for (int d = 1; d <= 9; d++) { // @2
        if (!allowed(i, d)) continue; // @3
        grid[i] = d; // @4
        if (solve()) return 1; // @5
        grid[i] = 0;   /* backtrack */ // @6
    }
    return 0; // @7
}

int main(void) {
    char line[256];
    int count = 0;
    while (fgets(line, sizeof line, stdin) && count < 81) {
        for (char *p = line; *p && count < 81; p++) {
            if (isspace((unsigned char)*p) || *p == '|' || *p == '+' || *p == '-') continue;
            grid[count++] = *p >= '1' && *p <= '9' ? *p - '0' : 0;
        }
    }
    int clash = 0;   /* the givens must not repeat in a row, column or box */
    for (int i = 0; i < 81; i++) if (grid[i] && !allowed(i, grid[i])) clash = 1;
    if (clash || !solve()) { printf("none\n"); return 0; }
    for (int r = 0; r < 9; r++) {
        for (int c = 0; c < 9; c++) printf("%d", grid[r * 9 + c]);
        printf("\n");
    }
    return 0;
}
`,

  huffman: String.raw`${io}
/* Nodes 0..nsym-1 are leaves, later ones are joined trees. */
static int weight[256], parent[256], in_queue[256], nodes;

/* Take the tree with the smallest frequency out of the queue. */
static int pop_min(void) {
    int best = -1;
    for (int i = 0; i < nodes; i++)
        if (in_queue[i] && (best < 0 || weight[i] < weight[best])) best = i;
    in_queue[best] = 0;
    return best;
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    const char *word = key_of("text");
    if (!word) word = trim(text);
    int freq[256] = {0};
    for (const char *p = word; *p; p++) freq[(unsigned char)*p]++; // @1
    nodes = 0;
    for (int ch = 0; ch < 256; ch++) if (freq[ch]) { // @2
        weight[nodes] = freq[ch]; parent[nodes] = -1; in_queue[nodes] = 1; nodes++;
    }
    int leaves = nodes, trees = nodes;
    while (trees > 1) { // @3
        int x = pop_min(), y = pop_min(); // @4
        weight[nodes] = weight[x] + weight[y]; parent[nodes] = -1; // @5
        parent[x] = parent[y] = nodes;
        in_queue[nodes] = 1; nodes++; trees--; // @6
    }
    long bits = 0;
    for (int leaf = 0; leaf < leaves; leaf++) {
        int length = 0;   /* code length = number of edges up to the root */ // @7
        for (int x = leaf; parent[x] >= 0; x = parent[x]) length++;
        if (length == 0) length = 1;   /* a single symbol still needs 1 bit */
        bits += (long)weight[leaf] * length; // @8
    }
    printf("%ld\n", bits);
    free(text);
    return 0;
}
`,

  'fractional-knapsack': String.raw`${io}
static int w[16], v[16];

/* Item a comes before item b when v[a]/w[a] > v[b]/w[b] (ties: smaller index first). */
static int before(int a, int b) {
    long long d = (long long)v[a] * w[b] - (long long)v[b] * w[a];
    return d > 0 || (d == 0 && a < b);
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    const char *ws = key_of("weights"), *vs = key_of("values"), *cs = key_of("capacity");
    int n = parse_ints(ws ? ws : "", w, 16);
    parse_ints(vs ? vs : "", v, 16);
    int room = cs ? atoi(cs) : 0;
    int order[16];
    for (int i = 0; i < n; i++) order[i] = i;
    for (int i = 1; i < n; i++) // @1
        for (int j = i; j > 0 && before(order[j], order[j - 1]); j--) {
            int t = order[j]; order[j] = order[j - 1]; order[j - 1] = t;
        }
    long long num = 0, den = 1;   /* the total value is num / den, kept exact */
    for (int k = 0; k < n && room > 0; k++) { // @2
        int i = order[k];
        if (w[i] <= room) { room -= w[i]; num += v[i] * den; } // @3
        else { // @4
            num = num * w[i] + (long long)v[i] * room * den;
            den *= w[i];
            room = 0;
        }
    }
    /* round half up to 2 decimals with integers only */
    long long cents = (2 * 100 * num + den) / (2 * den);
    printf("%d.%02d\n", (int)(cents / 100), (int)(cents % 100)); // @5
    free(text);
    return 0;
}
`,

  'job-sequencing': String.raw`${io}
int main(void) {
    int deadline[16], profit[16], n = 0;
    char line[256];
    while (fgets(line, sizeof line, stdin) && n < 16) {
        int pair[2];
        if (parse_ints(line, pair, 2) < 2) continue;
        deadline[n] = pair[0]; profit[n] = pair[1]; n++;
    }
    int order[16], slots = 0;
    for (int i = 0; i < n; i++) { order[i] = i; if (deadline[i] > slots) slots = deadline[i]; }
    for (int i = 1; i < n; i++)   /* stable sort by profit, largest first */ // @1
        for (int j = i; j > 0 && profit[order[j]] > profit[order[j - 1]]; j--) {
            int t = order[j]; order[j] = order[j - 1]; order[j - 1] = t;
        }
    int slot[16], total = 0;
    for (int t = 0; t <= slots; t++) slot[t] = -1;
    for (int k = 0; k < n; k++) { // @2
        int j = order[k];
        int t = deadline[j] < slots ? deadline[j] : slots;
        for (; t >= 1; t--) { // @3
            if (slot[t] < 0) { slot[t] = j; total += profit[j]; break; } // @4
        }
    }
    int first = 1;
    for (int t = 1; t <= slots; t++) if (slot[t] >= 0) { // @6
        printf(first ? "J%d" : " J%d", slot[t] + 1);
        first = 0;
    }
    printf("\n%d\n", total);
    return 0;
}
`,

  'avl-tree': String.raw`${io}
#define MAXN 64
static int key[MAXN], left[MAXN], right[MAXN], height[MAXN], nnodes;   /* -1 = empty */

static int h(int node) { return node < 0 ? 0 : height[node]; }
static void update(int node) { int a = h(left[node]), b = h(right[node]); height[node] = 1 + (a > b ? a : b); }

static int rotate_right(int node) {
    int x = left[node];
    left[node] = right[x]; right[x] = node;
    update(node); update(x);
    return x;
}

static int rotate_left(int node) {
    int x = right[node];
    right[node] = left[x]; left[x] = node;
    update(node); update(x);
    return x;
}

static int insert(int node, int k) { // @0
    if (node < 0) { // @1
        key[nnodes] = k; left[nnodes] = right[nnodes] = -1; height[nnodes] = 1;
        return nnodes++;
    }
    if (k < key[node]) left[node] = insert(left[node], k); // @2
    else if (k > key[node]) right[node] = insert(right[node], k); // @3
    else return node;   /* duplicate */ // @4
    update(node);
    int b = h(left[node]) - h(right[node]); // @5
    if (b > 1 && k < key[left[node]]) return rotate_right(node); // @6
    if (b < -1 && k > key[right[node]]) return rotate_left(node); // @7
    if (b > 1) { left[node] = rotate_left(left[node]); return rotate_right(node); } // @8
    if (b < -1) { right[node] = rotate_right(right[node]); return rotate_left(node); } // @9
    return node; // @10
}

static int printed;
static void preorder(int node) {
    if (node < 0) return;
    printf(printed++ ? " %d" : "%d", key[node]);
    preorder(left[node]);
    preorder(right[node]);
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    const char *list = key_of("values");
    int values[MAXN];
    int n = parse_ints(list ? list : text, values, MAXN);
    int root = -1;
    for (int i = 0; i < n; i++) root = insert(root, values[i]);
    preorder(root);
    printf("\n");
    free(text);
    return 0;
}
`,

  'binary-heap': String.raw`${io}
static int a[64], n;

static void swap(int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }

static void insert(int x) { // @0
    int i = n;
    a[n++] = x; // @1
    while (i > 0 && a[(i - 1) / 2] > a[i]) { // @2
        swap(i, (i - 1) / 2); i = (i - 1) / 2; // @3
    }
}

static int extract_min(void) { // @4
    int min = a[0];
    swap(0, n - 1); n--; // @5
    int i = 0;
    for (;;) { // @6
        int c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && a[c + 1] < a[c]) c = c + 1;   /* the smaller child */
        if (a[c] >= a[i]) break;
        swap(i, c); i = c; // @7
    }
    return min; // @8
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    const char *list = key_of("values"), *e = key_of("extract");
    int values[64];
    int count = parse_ints(list ? list : text, values, 64);
    int extract = e ? atoi(e) : 1;
    n = 0;
    for (int i = 0; i < count; i++) insert(values[i]);
    for (int i = 0; i < n; i++) printf(i ? " %d" : "%d", a[i]);
    printf("\n");
    for (int k = 0; k < extract; k++) printf(k ? " %d" : "%d", extract_min());
    printf("\n");
    free(text);
    return 0;
}
`,

  trie: String.raw`${io}
#define MAXN 256
static int child[MAXN][26], is_end[MAXN], nnodes = 1;   /* node 0 is the root; 0 = no child */
static char word[16];
static int found;

static void insert(const char *w) { // @0
    int node = 0; // @1
    for (; *w; w++) { // @2
        int ch = *w - 'a';
        if (!child[node][ch]) child[node][ch] = nnodes++; // @3
        node = child[node][ch]; // @4
    }
    is_end[node] = 1; // @5
}

/* Print every word below node in alphabetical order. */
static void collect(int node, int depth) {
    if (is_end[node]) { word[depth] = '\0'; printf(found++ ? " %s" : "%s", word); }
    for (int ch = 0; ch < 26; ch++) if (child[node][ch]) {
        word[depth] = (char)('a' + ch);
        collect(child[node][ch], depth + 1);
    }
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    char words[VALUE_LEN];
    strcpy(words, key_of("words") ? key_of("words") : "");
    for (char *w = strtok(words, " ,\t"); w; w = strtok(NULL, " ,\t")) insert(w);
    const char *prefix = key_of("find") ? key_of("find") : "";
    int node = 0, depth = 0;
    for (const char *p = prefix; *p && node >= 0; p++) { // @7
        node = child[node][*p - 'a'] ? child[node][*p - 'a'] : -1;
        word[depth++] = *p;
    }
    if (node >= 0) collect(node, depth); // @8
    printf(found ? "\n" : "none\n");
    free(text);
    return 0;
}
`,
};
