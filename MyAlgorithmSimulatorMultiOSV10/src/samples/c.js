// C samples. Each program reads the input box on stdin and prints the result.
const io = String.raw`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

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

static int read_ints(int **out) {
    char *text = read_all(), *p = text;
    int cap = 16, n = 0;
    int *a = malloc((size_t)cap * sizeof(int));
    while (*p) {
        while (*p && *p != '-' && !isdigit((unsigned char)*p)) p++;
        if (!*p) break;
        char *end = p;
        long v = strtol(p, &end, 10);
        if (end == p) break;
        if (n == cap) { cap *= 2; a = realloc(a, (size_t)cap * sizeof(int)); }
        a[n++] = (int)v;
        p = end;
    }
    free(text);
    *out = a;
    return n;
}

static void show(const int *a, int n) {
    for (int i = 0; i < n; i++) {
        if (i) printf(" ");
        printf("%d", a[i]);
    }
    printf("\n");
}
`;

const keyed = String.raw`
#define MAX_KEYS 32
#define MAX_REST 128
#define LINE_LEN 512

static char key_name[MAX_KEYS][32];
static char key_value[MAX_KEYS][LINE_LEN];
static int nkeys;
static char rest[MAX_REST][LINE_LEN];
static int nrest;

static const char *key_of(const char *name) {
    for (int i = 0; i < nkeys; i++) if (strcmp(key_name[i], name) == 0) return key_value[i];
    return "";
}

static int key_head(const char *s, const char *colon) {
    if (colon <= s) return 0;
    for (const char *c = s; c < colon; c++) {
        if (*c == ' ' || *c == '\t') continue;
        if (!isalpha((unsigned char)*c) && *c != '_') return 0;
    }
    return 1;
}

static void parse_keyed(char *text) {
    nkeys = nrest = 0;
    char *p = text;
    while (*p) {
        char *line = p;
        while (*p && *p != '\n') p++;
        if (*p == '\n') *p++ = '\0';
        char *hash = strchr(line, '#');
        if (hash) *hash = '\0';
        while (*line == ' ' || *line == '\t' || *line == '\r') line++;
        size_t len = strlen(line);
        while (len && (line[len - 1] == ' ' || line[len - 1] == '\t' || line[len - 1] == '\r')) line[--len] = '\0';
        if (!*line) continue;
        char *colon = strchr(line, ':');
        if (colon && key_head(line, colon) && nkeys < MAX_KEYS) {
            char *k = line;
            while (*k == ' ' || *k == '\t') k++;
            int n = (int)(colon - k);
            while (n && (k[n - 1] == ' ' || k[n - 1] == '\t')) n--;
            if (n > 31) n = 31;
            for (int i = 0; i < n; i++) key_name[nkeys][i] = (char)tolower((unsigned char)k[i]);
            key_name[nkeys][n] = '\0';
            char *v = colon + 1;
            while (*v == ' ' || *v == '\t') v++;
            strncpy(key_value[nkeys], v, LINE_LEN - 1);
            key_value[nkeys][LINE_LEN - 1] = '\0';
            nkeys++;
        } else if (nrest < MAX_REST) {
            strncpy(rest[nrest], line, LINE_LEN - 1);
            rest[nrest][LINE_LEN - 1] = '\0';
            nrest++;
        }
    }
}

static int parse_ints(const char *s, int *out, int cap) {
    int n = 0;
    while (*s && n < cap) {
        while (*s && *s != '-' && !isdigit((unsigned char)*s)) s++;
        if (!*s) break;
        char *end = NULL;
        long v = strtol(s, &end, 10);
        if (end == s) break;
        out[n++] = (int)v;
        s = end;
    }
    return n;
}

static void rest_text(char *buf, size_t cap) {
    buf[0] = '\0';
    for (int i = 0; i < nrest; i++) {
        size_t used = strlen(buf);
        if (i && used + 1 < cap) { buf[used++] = ' '; buf[used] = '\0'; }
        strncat(buf, rest[i], cap - strlen(buf) - 1);
    }
}
`;

const graph = String.raw`
#define MAXN 32
#define MAXE 256
static char names[MAXN][16];
static int nnames;
static int eu[MAXE], ev[MAXE], ew[MAXE], nedges;
static int adj_v[MAXN][MAXN], adj_w[MAXN][MAXN], deg[MAXN];

static int index_of(const char *name) {
    for (int i = 0; i < nnames; i++) if (strcmp(names[i], name) == 0) return i;
    if (nnames >= MAXN) return nnames - 1;
    strncpy(names[nnames], name, 15);
    names[nnames][15] = '\0';
    return nnames++;
}

static void build_graph(int directed) {
    nnames = nedges = 0;
    memset(deg, 0, sizeof deg);
    for (int i = 0; i < nrest; i++) {
        char a[32], b[32];
        int w = 1, got = sscanf(rest[i], "%31s %31s %d", a, b, &w);
        if (got <= 0) continue;
        if (got == 1) { index_of(a); continue; }
        if (got == 2) w = 1;
        int u = index_of(a), v = index_of(b);
        if (nedges < MAXE) { eu[nedges] = u; ev[nedges] = v; ew[nedges] = w; nedges++; }
        if (deg[u] < MAXN) { adj_v[u][deg[u]] = v; adj_w[u][deg[u]] = w; deg[u]++; }
        if (!directed && deg[v] < MAXN) { adj_v[v][deg[v]] = u; adj_w[v][deg[v]] = w; deg[v]++; }
    }
}

static int start_index(void) {
    const char *s = key_of("start");
    if (!s[0]) return 0;
    for (int i = 0; i < nnames; i++) if (strcmp(names[i], s) == 0) return i;
    return 0;
}
`;

const sort = (body) => `${io}
int main(void) {
    int *a = NULL;
    int n = read_ints(&a);
${body}
    show(a, n);
    free(a);
    return 0;
}
`;

function withKeys(prefix, body) {
  return `${io}
${keyed}
${prefix}
int main(void) {
    char *text = read_all();
    parse_keyed(text);
    free(text);
${body}
    return 0;
}
`;
}

function withGraph(body, directed = false, prefix = '') {
  return `${io}
${keyed}
${graph}
${prefix}
int main(void) {
    char *text = read_all();
    parse_keyed(text);
    free(text);
    build_graph(${directed ? 1 : 0});
${body}
    return 0;
}
`;
}

const INF = '4000000000000000000LL';

export const c = {
  'bubble-sort': sort(String.raw`    for (int i = 0; i + 1 < n; i++) { // @1
        int swapped = 0; // @2
        for (int j = 0; j + 1 + i < n; j++) { // @3
            if (a[j] > a[j + 1]) { // @4
                int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; // @5
                swapped = 1; // @6
            }
        }
        if (!swapped) break; // @7
    }
    // @8`),

  'selection-sort': sort(String.raw`    for (int i = 0; i + 1 < n; i++) { // @1
        int m = i; // @2
        for (int j = i + 1; j < n; j++) { // @3
            if (a[j] < a[m]) m = j; // @4
        }
        if (m != i) { // @6
            int t = a[i]; a[i] = a[m]; a[m] = t; // @7
        }
    }
    // @8`),

  'insertion-sort': sort(String.raw`    for (int i = 1; i < n; i++) { // @1
        int key = a[i]; // @2
        int j = i - 1; // @3
        while (j >= 0 && a[j] > key) { // @4
            a[j + 1] = a[j]; // @5
            j--; // @6
        }
        a[j + 1] = key; // @7
    }
    // @8`),

  'shell-sort': sort(String.raw`    for (int gap = n / 2; gap > 0; gap /= 2) { // @1
        for (int i = gap; i < n; i++) { // @3
            int temp = a[i], j = i; // @4
            while (j >= gap && a[j - gap] > temp) { // @5
                a[j] = a[j - gap]; // @6
                j -= gap;
            }
            a[j] = temp; // @7
        }
    }
    // @9`),

  'merge-sort': `${io}
static void merge_sort(int *a, int lo, int hi) {
    if (lo >= hi) return; // @1
    int mid = (lo + hi) / 2; // @2
    merge_sort(a, lo, mid);
    merge_sort(a, mid + 1, hi);
    int *merged = malloc((size_t)(hi - lo + 1) * sizeof(int));
    int i = lo, j = mid + 1, k = 0;
    while (i <= mid && j <= hi) merged[k++] = a[i] <= a[j] ? a[i++] : a[j++]; // @9
    while (i <= mid) merged[k++] = a[i++];
    while (j <= hi) merged[k++] = a[j++];
    for (int t = 0; t < k; t++) a[lo + t] = merged[t]; // @5
    free(merged);
}

int main(void) {
    int *a = NULL;
    int n = read_ints(&a);
    if (n) merge_sort(a, 0, n - 1); // @0
    show(a, n);
    free(a);
    return 0;
}
`,

  'quick-sort': `${io}
static void quick_sort(int *a, int lo, int hi) {
    if (lo >= hi) return; // @1
    int pivot = a[hi], i = lo; // @6
    for (int j = lo; j < hi; j++) { // @7
        if (a[j] < pivot) { // @8
            int t = a[i]; a[i] = a[j]; a[j] = t; // @9
            i++;
        }
    }
    int t = a[i]; a[i] = a[hi]; a[hi] = t; // @10
    quick_sort(a, lo, i - 1);
    quick_sort(a, i + 1, hi);
}

int main(void) {
    int *a = NULL;
    int n = read_ints(&a);
    if (n) quick_sort(a, 0, n - 1); // @0
    show(a, n);
    free(a);
    return 0;
}
`,

  'heap-sort': `${io}
static void sift(int *a, int i, int size) {
    for (;;) { // @7
        int l = 2 * i + 1, r = 2 * i + 2, largest = i;
        if (l < size && a[l] > a[largest]) largest = l;
        if (r < size && a[r] > a[largest]) largest = r;
        if (largest == i) return; // @10
        int t = a[i]; a[i] = a[largest]; a[largest] = t; // @11
        i = largest;
    }
}

int main(void) {
    int *a = NULL;
    int n = read_ints(&a); // @0
    for (int i = n / 2 - 1; i >= 0; i--) sift(a, i, n); // @2
    for (int end = n - 1; end > 0; end--) { // @3
        int t = a[0]; a[0] = a[end]; a[end] = t; // @4
        sift(a, 0, end);
    }
    show(a, n);
    free(a);
    return 0;
}
`,

  'radix-sort': sort(String.raw`    int top = a[0];
    for (int i = 1; i < n; i++) if (a[i] > top) top = a[i]; // @1
    for (int exp = 1; top / exp > 0; exp *= 10) { // @3
        int bucket[10][64], count[10] = {0};
        for (int i = 0; i < n; i++) { // @5
            int d = (a[i] / exp) % 10;
            bucket[d][count[d]++] = a[i];
        }
        int k = 0;
        for (int d = 0; d < 10; d++) for (int i = 0; i < count[d]; i++) a[k++] = bucket[d][i]; // @6
    }
    // @8`),

  'linear-search': withKeys('', String.raw`    int a[64], values[64];
    char joined[2048];
    rest_text(joined, sizeof joined);
    int n = parse_ints(joined, a, 64);
    int target = atoi(key_of("target")); // @0
    int found = -1; // @1
    for (int i = 0; i < n; i++) { // @2
        if (a[i] == target) { found = i; break; } // @3
    }
    printf("%d\n", found); // @4
    (void)values;`),

  'binary-search': `${io}
${keyed}
static int cmp_int(const void *p, const void *q) {
    int x = *(const int *)p, y = *(const int *)q;
    return (x > y) - (x < y);
}

int main(void) {
    char *text = read_all();
    parse_keyed(text);
    free(text);
    int a[64];
    char joined[2048];
    rest_text(joined, sizeof joined);
    int n = parse_ints(joined, a, 64);
    qsort(a, (size_t)n, sizeof(int), cmp_int);
    int target = atoi(key_of("target"));
    int lo = 0, hi = n - 1, found = -1; // @1
    while (lo <= hi) { // @2
        int mid = (lo + hi) / 2; // @3
        if (a[mid] == target) { found = mid; break; } // @4
        if (a[mid] < target) lo = mid + 1; // @5
        else hi = mid - 1; // @6
    }
    printf("%d\\n", found); // @7
    return 0;
}
`,

  bfs: withGraph(String.raw`    int start = start_index();
    int seen[MAXN] = {0}, q[MAXN], qh = 0, qt = 0;
    q[qt++] = start;
    seen[start] = 1;
    int first = 1;
    while (qh < qt) {
        int u = q[qh++];
        if (!first) printf(" ");
        first = 0;
        printf("%s", names[u]);
        for (int i = 0; i < deg[u]; i++) {
            int v = adj_v[u][i];
            if (!seen[v]) { seen[v] = 1; q[qt++] = v; }
        }
    }
    printf("\n");`),

  dfs: withGraph(String.raw`    int start = start_index();
    int seen[MAXN] = {0};
    int stack[MAXN], sp = 0, first = 1;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp) {
        int u = stack[--sp];
        if (!first) printf(" ");
        first = 0;
        printf("%s", names[u]);
        for (int i = deg[u] - 1; i >= 0; i--) {
            int v = adj_v[u][i];
            if (!seen[v]) { seen[v] = 1; stack[sp++] = v; }
        }
    }
    printf("\n");`),

  dijkstra: withGraph(String.raw`    long long INF = ${INF};
    int start = start_index();
    long long dist[MAXN];
    int used[MAXN] = {0};
    for (int i = 0; i < nnames; i++) dist[i] = INF;
    dist[start] = 0;
    for (int round = 0; round < nnames; round++) {
        int u = -1;
        for (int i = 0; i < nnames; i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || dist[u] >= INF / 2) break;
        used[u] = 1;
        for (int i = 0; i < deg[u]; i++) {
            int v = adj_v[u][i];
            if (!used[v] && dist[u] + adj_w[u][i] < dist[v]) dist[v] = dist[u] + adj_w[u][i];
        }
    }
    for (int i = 0; i < nnames; i++) {
        if (i) printf(" ");
        printf("%s=", names[i]);
        if (dist[i] >= INF / 2) printf("INF"); else printf("%lld", dist[i]);
    }
    printf("\n");`),

  'bellman-ford': withGraph(String.raw`    long long INF = ${INF};
    int start = start_index();
    long long dist[MAXN];
    for (int i = 0; i < nnames; i++) dist[i] = INF;
    dist[start] = 0;
    for (int round = 1; round < nnames; round++) {
        int changed = 0;
        for (int e = 0; e < nedges; e++) {
            if (dist[eu[e]] < INF / 2 && dist[eu[e]] + ew[e] < dist[ev[e]]) {
                dist[ev[e]] = dist[eu[e]] + ew[e];
                changed = 1;
            }
        }
        if (!changed) break;
    }
    int neg = 0;
    for (int e = 0; e < nedges; e++) if (dist[eu[e]] < INF / 2 && dist[eu[e]] + ew[e] < dist[ev[e]]) neg = 1;
    if (neg) printf("negative cycle\n");
    else {
        for (int i = 0; i < nnames; i++) {
            if (i) printf(" ");
            printf("%s=", names[i]);
            if (dist[i] >= INF / 2) printf("INF"); else printf("%lld", dist[i]);
        }
        printf("\n");
    }`, true),

  'floyd-warshall': withGraph(String.raw`    long long INF = ${INF};
    int n = nnames;
    long long d[MAXN][MAXN];
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) d[i][j] = i == j ? 0 : INF;
    for (int e = 0; e < nedges; e++) if (ew[e] < d[eu[e]][ev[e]]) d[eu[e]][ev[e]] = ew[e];
    for (int k = 0; k < n; k++)
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (d[i][k] < INF / 2 && d[k][j] < INF / 2 && d[i][k] + d[k][j] < d[i][j])
                    d[i][j] = d[i][k] + d[k][j];
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            if (j) printf(" ");
            if (d[i][j] > INF / 2) printf("INF"); else printf("%lld", d[i][j]);
        }
        printf("\n");
    }`, true),

  prim: withGraph(String.raw`    long long INF = ${INF};
    int start = start_index();
    long long key[MAXN];
    int used[MAXN] = {0};
    for (int i = 0; i < nnames; i++) key[i] = INF;
    key[start] = 0;
    long long total = 0;
    for (int round = 0; round < nnames; round++) {
        int u = -1;
        for (int i = 0; i < nnames; i++) if (!used[i] && (u < 0 || key[i] < key[u])) u = i;
        if (u < 0 || key[u] >= INF / 2) break;
        used[u] = 1;
        total += key[u];
        for (int i = 0; i < deg[u]; i++) {
            int v = adj_v[u][i];
            if (!used[v] && adj_w[u][i] < key[v]) key[v] = adj_w[u][i];
        }
    }
    printf("%lld\n", total);`),

  kruskal: withGraph(String.raw`    int parent[MAXN], order[MAXE];
    for (int i = 0; i < nnames; i++) parent[i] = i;
    for (int i = 0; i < nedges; i++) order[i] = i;
    for (int i = 1; i < nedges; i++) {
        int key = order[i], j = i - 1;
        while (j >= 0 && (ew[order[j]] > ew[key] || (ew[order[j]] == ew[key] && order[j] > key))) {
            order[j + 1] = order[j];
            j--;
        }
        order[j + 1] = key;
    }
    long long total = 0;
    for (int i = 0; i < nedges; i++) {
        int u = eu[order[i]], v = ev[order[i]];
        while (parent[u] != u) { parent[u] = parent[parent[u]]; u = parent[u]; }
        while (parent[v] != v) { parent[v] = parent[parent[v]]; v = parent[v]; }
        if (u != v) { parent[u] = v; total += ew[order[i]]; }
    }
    printf("%lld\n", total);`),

  'topological-sort': withGraph(String.raw`    int indeg[MAXN] = {0}, q[MAXN], qh = 0, qt = 0, out[MAXN], nout = 0;
    for (int e = 0; e < nedges; e++) indeg[ev[e]]++;
    for (int i = 0; i < nnames; i++) if (!indeg[i]) q[qt++] = i;
    while (qh < qt) {
        int u = q[qh++];
        out[nout++] = u;
        for (int i = 0; i < deg[u]; i++) {
            int v = adj_v[u][i];
            if (--indeg[v] == 0) q[qt++] = v;
        }
    }
    if (nout != nnames) printf("cycle\n");
    else {
        for (int i = 0; i < nout; i++) printf("%s%s", names[out[i]], i + 1 == nout ? "\n" : " ");
    }`, true),

  astar: `${io}
int main(void) {
    char rows[24][48];
    int nrows = 0, cols = 0;
    char line[80];
    while (fgets(line, sizeof line, stdin)) {
        size_t len = strlen(line);
        while (len && (line[len - 1] == '\\n' || line[len - 1] == '\\r')) line[--len] = '\\0';
        if (!len || nrows >= 24) continue;
        strncpy(rows[nrows], line, 47);
        rows[nrows][47] = '\\0';
        if (!nrows) cols = (int)strlen(rows[nrows]);
        nrows++;
    }
    int total = nrows * cols, start = -1, goal = -1;
    char wall[960] = {0};
    for (int r = 0; r < nrows; r++) for (int c = 0; c < cols; c++) {
        int i = r * cols + c;
        char ch = rows[r][c];
        if (ch == 'S' || ch == 's') start = i;
        else if (ch == 'G' || ch == 'g') goal = i;
        else if (ch == '#') wall[i] = 1;
    }
    int g[960], open[960], nopen = 0;
    char closed[960] = {0};
    for (int i = 0; i < total; i++) g[i] = 1000000000;
    g[start] = 0;
    open[nopen++] = start;
    int answer = -1;
    while (nopen) {
        int best = 0;
        for (int k = 1; k < nopen; k++) {
            int hk = abs(open[k] / cols - goal / cols) + abs(open[k] % cols - goal % cols);
            int hb = abs(open[best] / cols - goal / cols) + abs(open[best] % cols - goal % cols);
            int fk = g[open[k]] + hk, fb = g[open[best]] + hb;
            if (fk < fb || (fk == fb && hk < hb)) best = k;
        }
        int u = open[best];
        open[best] = open[--nopen];
        if (u == goal) { answer = g[u]; break; }
        closed[u] = 1;
        int r = u / cols, c = u % cols;
        int dr[4] = {-1, 0, 1, 0}, dc[4] = {0, 1, 0, -1};
        for (int k = 0; k < 4; k++) {
            int vr = r + dr[k], vc = c + dc[k];
            if (vr < 0 || vc < 0 || vr >= nrows || vc >= cols) continue;
            int v = vr * cols + vc;
            if (wall[v] || closed[v]) continue;
            if (g[u] + 1 < g[v]) {
                g[v] = g[u] + 1;
                int known = 0;
                for (int i = 0; i < nopen; i++) if (open[i] == v) known = 1;
                if (!known) open[nopen++] = v;
            }
        }
    }
    if (answer < 0) printf("none\\n"); else printf("%d\\n", answer);
    return 0;
}
`,

  fibonacci: withKeys('', String.raw`    int n = atoi(key_of("n"));
    unsigned long long *f = calloc((size_t)n + 1, sizeof *f);
    if (n >= 1) f[1] = 1;
    for (int i = 2; i <= n; i++) f[i] = f[i - 1] + f[i - 2];
    printf("%llu\n", f[n]);
    free(f);`),

  knapsack: withKeys('', String.raw`    int w[16], v[16];
    int nw = parse_ints(key_of("weights"), w, 16);
    parse_ints(key_of("values"), v, 16);
    int cap = atoi(key_of("capacity"));
    int k[17][21] = {0};
    for (int i = 1; i <= nw; i++) {
        for (int c = 0; c <= cap; c++) {
            k[i][c] = k[i - 1][c];
            if (w[i - 1] <= c) {
                int take = k[i - 1][c - w[i - 1]] + v[i - 1];
                if (take > k[i][c]) k[i][c] = take;
            }
        }
    }
    printf("%d\n", k[nw][cap]);`),

  lcs: withKeys('', String.raw`    const char *x = key_of("a"), *y = key_of("b");
    int m = (int)strlen(x), n = (int)strlen(y);
    int c[18][18] = {0};
    for (int i = 1; i <= m; i++) for (int j = 1; j <= n; j++)
        c[i][j] = x[i - 1] == y[j - 1] ? c[i - 1][j - 1] + 1 : (c[i - 1][j] > c[i][j - 1] ? c[i - 1][j] : c[i][j - 1]);
    char rev[32];
    int len = 0, i = m, j = n;
    while (i && j) {
        if (x[i - 1] == y[j - 1]) { rev[len++] = x[i - 1]; i--; j--; }
        else if (c[i - 1][j] >= c[i][j - 1]) i--;
        else j--;
    }
    for (int a = len - 1; a >= 0; a--) putchar(rev[a]);
    printf("\n");`),

  'edit-distance': withKeys('', String.raw`    const char *a = key_of("a"), *b = key_of("b");
    int m = (int)strlen(a), n = (int)strlen(b);
    int d[18][18];
    for (int i = 0; i <= m; i++) d[i][0] = i;
    for (int j = 0; j <= n; j++) d[0][j] = j;
    for (int i = 1; i <= m; i++) for (int j = 1; j <= n; j++) {
        if (a[i - 1] == b[j - 1]) d[i][j] = d[i - 1][j - 1];
        else {
            int best = d[i - 1][j];
            if (d[i][j - 1] < best) best = d[i][j - 1];
            if (d[i - 1][j - 1] < best) best = d[i - 1][j - 1];
            d[i][j] = best + 1;
        }
    }
    printf("%d\n", d[m][n]);`),

  kmp: withKeys('', String.raw`    const char *t = key_of("text"), *p = key_of("pattern");
    int m = (int)strlen(p), n = (int)strlen(t), lps[16] = {0}, length = 0, k = 1;
    while (k < m) {
        if (p[k] == p[length]) lps[k++] = ++length;
        else if (length) length = lps[length - 1];
        else lps[k++] = 0;
    }
    int found[48], nf = 0, i = 0, j = 0;
    while (i < n) {
        if (t[i] == p[j]) {
            i++; j++;
            if (j == m) { found[nf++] = i - m; j = lps[j - 1]; }
        } else if (j) j = lps[j - 1];
        else i++;
    }
    if (!nf) printf("none\n");
    else for (int z = 0; z < nf; z++) printf("%d%s", found[z], z + 1 == nf ? "\n" : " ");`),

  'rabin-karp': withKeys('', String.raw`    const char *t = key_of("text"), *p = key_of("pattern");
    int m = (int)strlen(p), n = (int)strlen(t), d = 256, q = 101, h = 1, ph = 0, th = 0;
    for (int k = 0; k < m - 1; k++) h = (h * d) % q;
    for (int k = 0; k < m; k++) {
        ph = (d * ph + (unsigned char)p[k]) % q;
        th = (d * th + (unsigned char)t[k]) % q;
    }
    int found[48], nf = 0;
    for (int s = 0; s <= n - m; s++) {
        if (ph == th && strncmp(t + s, p, (size_t)m) == 0) found[nf++] = s;
        if (s < n - m) {
            th = (d * (th - (unsigned char)t[s] * h) + (unsigned char)t[s + m]) % q;
            if (th < 0) th += q;
        }
    }
    if (!nf) printf("none\n");
    else for (int z = 0; z < nf; z++) printf("%d%s", found[z], z + 1 == nf ? "\n" : " ");`),

  bst: withKeys('', String.raw`    int values[40];
    char joined[2048];
    rest_text(joined, sizeof joined);
    int n = parse_ints(joined, values, 40);
    int target = atoi(key_of("search"));
    int key[40], left[40], right[40], nodes = 0, root = -1;
    for (int i = 0; i < n; i++) {
        if (root < 0) { key[0] = values[i]; left[0] = right[0] = -1; root = 0; nodes = 1; continue; }
        int cur = root;
        for (;;) {
            if (values[i] == key[cur]) break;
            int goLeft = values[i] < key[cur];
            int next = goLeft ? left[cur] : right[cur];
            if (next < 0) {
                key[nodes] = values[i]; left[nodes] = right[nodes] = -1;
                if (goLeft) left[cur] = nodes; else right[cur] = nodes;
                nodes++;
                break;
            }
            cur = next;
        }
    }
    int cur = root;
    const char *answer = "not found";
    while (cur >= 0) {
        if (target == key[cur]) { answer = "found"; break; }
        cur = target < key[cur] ? left[cur] : right[cur];
    }
    printf("%s\n", answer);`),

  'tree-traversal': withKeys(String.raw`
static int tkey[40], tleft[40], tright[40], tnodes, troot;

static void insert_bst(int value) {
    if (troot < 0) { tkey[0] = value; tleft[0] = tright[0] = -1; troot = 0; tnodes = 1; return; }
    int cur = troot;
    for (;;) {
        if (value == tkey[cur]) return;
        int goLeft = value < tkey[cur];
        int next = goLeft ? tleft[cur] : tright[cur];
        if (next < 0) {
            tkey[tnodes] = value; tleft[tnodes] = tright[tnodes] = -1;
            if (goLeft) tleft[cur] = tnodes; else tright[cur] = tnodes;
            tnodes++;
            return;
        }
        cur = next;
    }
}

static void walk(int cur, int order, int *out, int *n) {
    if (cur < 0) return;
    if (order == 0) out[(*n)++] = tkey[cur];
    walk(tleft[cur], order, out, n);
    if (order == 1) out[(*n)++] = tkey[cur];
    walk(tright[cur], order, out, n);
    if (order == 2) out[(*n)++] = tkey[cur];
}

static void show_list(const int *out, int n) {
    for (int i = 0; i < n; i++) printf("%d%s", out[i], i + 1 == n ? "\n" : " ");
}
`, String.raw`    int values[40];
    char joined[2048];
    rest_text(joined, sizeof joined);
    int n = parse_ints(joined, values, 40);
    troot = -1; tnodes = 0;
    for (int i = 0; i < n; i++) insert_bst(values[i]);
    int out[40];
    for (int order = 0; order < 3; order++) { int count = 0; walk(troot, order, out, &count); show_list(out, count); }
    int q[40], qh = 0, qt = 0, level[40], nlevel = 0;
    q[qt++] = troot;
    while (qh < qt) {
        int cur = q[qh++];
        level[nlevel++] = tkey[cur];
        if (tleft[cur] >= 0) q[qt++] = tleft[cur];
        if (tright[cur] >= 0) q[qt++] = tright[cur];
    }
    show_list(level, nlevel);`),

  'n-queens': withKeys(String.raw`
static int nqueens, stop, queens[12], solution[12], solutions;

static int safe(int row, int col) {
    for (int r = 0; r < row; r++) if (queens[r] == col || abs(queens[r] - col) == row - r) return 0;
    return 1;
}

static void solve(int row) {
    if (stop) return;
    if (row == nqueens) {
        if (!solutions) for (int i = 0; i < nqueens; i++) solution[i] = queens[i];
        solutions++;
        if (stop >= 0) stop = 1;
        return;
    }
    for (int col = 0; col < nqueens; col++) if (safe(row, col)) {
        queens[row] = col;
        solve(row + 1);
        queens[row] = -1;
    }
}
`, String.raw`    nqueens = atoi(key_of("n"));
    if (!nqueens && nrest) nqueens = atoi(rest[0]);
    char mode[16];
    strncpy(mode, key_of("mode")[0] ? key_of("mode") : "first", 15);
    mode[15] = '\0';
    for (char *p = mode; *p; p++) *p = (char)tolower((unsigned char)*p);
    int first = strcmp(mode, "all") != 0;
    stop = first ? 0 : -1;
    solutions = 0;
    for (int i = 0; i < nqueens; i++) queens[i] = -1;
    solve(0);
    if (!first) printf("%d\n", solutions);
    else if (!solutions) printf("none\n");
    else for (int i = 0; i < nqueens; i++) printf("%d%s", solution[i], i + 1 == nqueens ? "\n" : " ");`),

  gcd: withKeys('', String.raw`    int a = atoi(key_of("a")), b = atoi(key_of("b"));
    while (b) { int r = a % b; a = b; b = r; }
    printf("%d\n", a);`),

  sieve: withKeys('', String.raw`    int n = atoi(key_of("n"));
    char *prime = calloc((size_t)n + 1, 1);
    for (int i = 2; i <= n; i++) prime[i] = 1;
    for (int p = 2; p * p <= n; p++) if (prime[p]) for (int m = p * p; m <= n; m += p) prime[m] = 0;
    int first = 1;
    for (int p = 2; p <= n; p++) if (prime[p]) { if (!first) printf(" "); printf("%d", p); first = 0; }
    printf("\n");
    free(prime);`),

  hanoi: withKeys('', String.raw`    int n = atoi(key_of("n"));
    printf("%lld\n", (1LL << n) - 1);`),
};
