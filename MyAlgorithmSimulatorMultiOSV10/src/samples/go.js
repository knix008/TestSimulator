// Go samples. Each is a single file with package main.
const head = `package main
import ("bufio"; "fmt"; "os"; "strconv"; "strings")
func readAll() string { b, _ := os.ReadFile("/dev/stdin"); if len(b) == 0 { b, _ = readStdin() }; return string(b) }
func readStdin() ([]byte, error) { s := bufio.NewScanner(os.Stdin); s.Buffer(make([]byte, 0, 1<<20), 1<<20); var b strings.Builder; for s.Scan() { b.WriteString(s.Text()); b.WriteByte('\\n') }; return []byte(b.String()), s.Err() }
func ints(s string) []int { f := strings.Fields(strings.ReplaceAll(s, ",", " ")); o := make([]int, 0, len(f)); for _, x := range f { n, err := strconv.Atoi(x); if err == nil { o = append(o, n) } }; return o }
`;

// Windows has no /dev/stdin. Read os.Stdin directly instead.
const headWin = `package main
import ("fmt"; "io"; "os"; "strconv"; "strings")
func readAll() string { b, _ := io.ReadAll(os.Stdin); return string(b) }
func ints(s string) []int { f := strings.Fields(strings.ReplaceAll(s, ",", " ")); o := make([]int, 0, len(f)); for _, x := range f { n, err := strconv.Atoi(x); if err == nil { o = append(o, n) } }; return o }
`;

const useHead = headWin;

function keyed(body) {
  return `${useHead}
func main() {
    keys, rest := map[string]string{}, []string{}
    for _, raw := range strings.Split(readAll(), "\\n") {
        line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
        if line == "" { continue }
        head, tail, ok := strings.Cut(line, ":")
        key := ok && head != "" && strings.Trim(head, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_") == ""
        if key { keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail) } else { rest = append(rest, line) }
    }
${body}
}
`;
}

function graph(body, directed = false) {
  return keyed(`    names, edges := []string{}, [][3]int{}
    index := func(name string) int { for i, n := range names { if n == name { return i } }; names = append(names, name); return len(names) - 1 }
    for _, line := range rest {
        p := strings.Fields(line)
        if len(p) == 1 { index(p[0]); continue }
        w := 1; if len(p) > 2 { w, _ = strconv.Atoi(p[2]) }
        edges = append(edges, [3]int{index(p[0]), index(p[1]), w})
    }
    adj := make([][][2]int, len(names))
    for _, e := range edges { adj[e[0]] = append(adj[e[0]], [2]int{e[1], e[2]}); ${directed ? '' : 'adj[e[1]] = append(adj[e[1]], [2]int{e[0], e[2]})'} }
${body}`);
}

const show = (name) => `for i, v := range ${name} { if i > 0 { fmt.Print(" ") }; fmt.Print(v) }; fmt.Println()`;

export const go = {
  'bubble-sort': `${useHead}
func main() {
	a := ints(readAll())
	for i := 0; i+1 < len(a); i++ { // @1
		swapped := false // @2
		for j := 0; j+1+i < len(a); j++ { // @3
			if a[j] > a[j+1] { // @4
				a[j], a[j+1] = a[j+1], a[j] // @5
				swapped = true // @6
			}
		}
		if !swapped { break } // @7
	}
	${show('a')}
}
`,
  'selection-sort': `${useHead}
func main() { a := ints(readAll()); for i := 0; i+1 < len(a); i++ { m := i; for j := i + 1; j < len(a); j++ { if a[j] < a[m] { m = j } }; a[i], a[m] = a[m], a[i] }; ${show('a')} }
`,
  'insertion-sort': `${useHead}
func main() { a := ints(readAll()); for i := 1; i < len(a); i++ { key, j := a[i], i-1; for j >= 0 && a[j] > key { a[j+1] = a[j]; j-- }; a[j+1] = key }; ${show('a')} }
`,
  'shell-sort': `${useHead}
func main() { a := ints(readAll()); for gap := len(a) / 2; gap > 0; gap /= 2 { for i := gap; i < len(a); i++ { temp, j := a[i], i; for j >= gap && a[j-gap] > temp { a[j] = a[j-gap]; j -= gap }; a[j] = temp } }; ${show('a')} }
`,
  'merge-sort': `${useHead}
func main() { a := ints(readAll()); var merge func(int, int); merge = func(lo, hi int) { if lo >= hi { return }; mid := (lo + hi) / 2; merge(lo, mid); merge(mid+1, hi); m := []int{}; i, j := lo, mid+1; for i <= mid && j <= hi { if a[i] <= a[j] { m = append(m, a[i]); i++ } else { m = append(m, a[j]); j++ } }; m = append(m, a[i:mid+1]...); m = append(m, a[j:hi+1]...); copy(a[lo:], m) }; merge(0, len(a)-1); ${show('a')} }
`,
  'quick-sort': `${useHead}
func main() { a := ints(readAll()); var sort func(int, int); sort = func(lo, hi int) { if lo >= hi { return }; pivot, i := a[hi], lo; for j := lo; j < hi; j++ { if a[j] < pivot { a[i], a[j] = a[j], a[i]; i++ } }; a[i], a[hi] = a[hi], a[i]; sort(lo, i-1); sort(i+1, hi) }; sort(0, len(a)-1); ${show('a')} }
`,
  'heap-sort': `${useHead}
func main() { a := ints(readAll()); var sift func(int, int); sift = func(i, size int) { for { l, r, largest := 2*i+1, 2*i+2, i; if l < size && a[l] > a[largest] { largest = l }; if r < size && a[r] > a[largest] { largest = r }; if largest == i { return }; a[i], a[largest] = a[largest], a[i]; i = largest } }; n := len(a); for i := n/2 - 1; i >= 0; i-- { sift(i, n) }; for end := n - 1; end > 0; end-- { a[0], a[end] = a[end], a[0]; sift(0, end) }; ${show('a')} }
`,
  'radix-sort': `${useHead}
func main() { a := ints(readAll()); top := a[0]; for _, v := range a { if v > top { top = v } }; for exp := 1; top/exp > 0; exp *= 10 { buckets := make([][]int, 10); for _, v := range a { buckets[(v/exp)%10] = append(buckets[(v/exp)%10], v) }; a = a[:0]; for _, b := range buckets { a = append(a, b...) } }; ${show('a')} }
`,
  'linear-search': `${useHead}
func main() { lines := strings.Split(strings.TrimSpace(readAll()), "\\n"); a := ints(lines[0]); target, _ := strconv.Atoi(strings.TrimSpace(strings.SplitN(lines[1], ":", 2)[1])); found := -1; for i, v := range a { if v == target { found = i; break } }; fmt.Println(found) }
`,
  'binary-search': `${useHead}
func main() { lines := strings.Split(strings.TrimSpace(readAll()), "\\n"); a := ints(lines[0]); for i := 1; i < len(a); i++ { for j := i; j > 0 && a[j] < a[j-1]; j-- { a[j], a[j-1] = a[j-1], a[j] } }; target, _ := strconv.Atoi(strings.TrimSpace(strings.SplitN(lines[1], ":", 2)[1])); lo, hi, found := 0, len(a)-1, -1; for lo <= hi { mid := (lo + hi) / 2; if a[mid] == target { found = mid; break }; if a[mid] < target { lo = mid + 1 } else { hi = mid - 1 } }; fmt.Println(found) }
`,
  bfs: graph(`    start := 0; for i, n := range names { if n == keys["start"] { start = i } }
    seen := map[int]bool{start: true}; q, order := []int{start}, []string{}
    for len(q) > 0 { u := q[0]; q = q[1:]; order = append(order, names[u]); for _, e := range adj[u] { if !seen[e[0]] { seen[e[0]] = true; q = append(q, e[0]) } } }
    fmt.Println(strings.Join(order, " "))`),
  dfs: graph(`    start := 0; for i, n := range names { if n == keys["start"] { start = i } }
    seen := map[int]bool{}; order := []string{}; var visit func(int); visit = func(u int) { seen[u] = true; order = append(order, names[u]); for _, e := range adj[u] { if !seen[e[0]] { visit(e[0]) } } }; visit(start)
    fmt.Println(strings.Join(order, " "))`),
  dijkstra: graph(`    const INF = int(1e18); start := 0; for i, n := range names { if n == keys["start"] { start = i } }
    dist := make([]int, len(names)); for i := range dist { dist[i] = INF }; dist[start] = 0; used := make([]bool, len(names))
    for round := 0; round < len(names); round++ { u := -1; for i := range names { if !used[i] && (u < 0 || dist[i] < dist[u]) { u = i } }; if dist[u] == INF { break }; used[u] = true; for _, e := range adj[u] { if !used[e[0]] && dist[u]+e[1] < dist[e[0]] { dist[e[0]] = dist[u] + e[1] } } }
    for i, n := range names { if i > 0 { fmt.Print(" ") }; if dist[i] == INF { fmt.Print(n, "=INF") } else { fmt.Print(n, "=", dist[i]) } }; fmt.Println()`),
  'bellman-ford': graph(`    const INF = int(1e18); start := 0; for i, n := range names { if n == keys["start"] { start = i } }
    dist := make([]int, len(names)); for i := range dist { dist[i] = INF }; dist[start] = 0
    for round := 1; round < len(names); round++ { changed := false; for _, e := range edges { if dist[e[0]] != INF && dist[e[0]]+e[2] < dist[e[1]] { dist[e[1]] = dist[e[0]] + e[2]; changed = true } }; if !changed { break } }
    neg := false; for _, e := range edges { if dist[e[0]] != INF && dist[e[0]]+e[2] < dist[e[1]] { neg = true } }
    if neg { fmt.Println("negative cycle") } else { for i, n := range names { if i > 0 { fmt.Print(" ") }; if dist[i] == INF { fmt.Print(n, "=INF") } else { fmt.Print(n, "=", dist[i]) } }; fmt.Println() }`, true),
  'floyd-warshall': graph(`    const INF = int(1e18); n := len(names); d := make([][]int, n); for i := range d { d[i] = make([]int, n); for j := range d[i] { if i == j { d[i][j] = 0 } else { d[i][j] = INF } } }
    for _, e := range edges { if e[2] < d[e[0]][e[1]] { d[e[0]][e[1]] = e[2] } }
    for k := 0; k < n; k++ { for i := 0; i < n; i++ { for j := 0; j < n; j++ { if d[i][k]+d[k][j] < d[i][j] { d[i][j] = d[i][k] + d[k][j] } } } }
    for i := 0; i < n; i++ { for j := 0; j < n; j++ { if j > 0 { fmt.Print(" ") }; if d[i][j] > INF/2 { fmt.Print("INF") } else { fmt.Print(d[i][j]) } }; fmt.Println() }`, true),
  prim: graph(`    const INF = int(1e18); start := 0; for i, n := range names { if n == keys["start"] { start = i } }
    key := make([]int, len(names)); for i := range key { key[i] = INF }; key[start] = 0; used := make([]bool, len(names)); total := 0
    for round := 0; round < len(names); round++ { u := -1; for i := range names { if !used[i] && (u < 0 || key[i] < key[u]) { u = i } }; if key[u] == INF { break }; used[u] = true; total += key[u]; for _, e := range adj[u] { if !used[e[0]] && e[1] < key[e[0]] { key[e[0]] = e[1] } } }
    fmt.Println(total)`),
  kruskal: graph(`    parent := make([]int, len(names)); for i := range parent { parent[i] = i }
    find := func(x int) int { for parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x] }; return x }
    order := append([][3]int{}, edges...); for i := 1; i < len(order); i++ { for j := i; j > 0 && order[j][2] < order[j-1][2]; j-- { order[j], order[j-1] = order[j-1], order[j] } }
    total := 0; for _, e := range order { ru, rv := find(e[0]), find(e[1]); if ru != rv { parent[ru] = rv; total += e[2] } }; fmt.Println(total)`),
  'topological-sort': graph(`    indeg := make([]int, len(names)); for _, e := range edges { indeg[e[1]]++ }
    q := []int{}; for i, d := range indeg { if d == 0 { q = append(q, i) } }; order := []string{}
    for len(q) > 0 { u := q[0]; q = q[1:]; order = append(order, names[u]); for _, e := range adj[u] { indeg[e[0]]--; if indeg[e[0]] == 0 { q = append(q, e[0]) } } }
    if len(order) != len(names) { fmt.Println("cycle") } else { fmt.Println(strings.Join(order, " ")) }`, true),
  astar: `${useHead}
func main() { rows := []string{}; for _, line := range strings.Split(readAll(), "\\n") { line = strings.TrimSpace(line); if line != "" { rows = append(rows, line) } }
    cols, start, goal := len(rows[0]), -1, -1; walls := map[int]bool{}
    for r, row := range rows { for c, ch := range row { i := r*cols + c; switch ch { case 'S', 's': start = i; case 'G', 'g': goal = i; case '#': walls[i] = true } } }
    h := func(i int) int { dr, dc := i/cols-goal/cols, i%cols-goal%cols; if dr < 0 { dr = -dr }; if dc < 0 { dc = -dc }; return dr + dc }
    g := map[int]int{start: 0}; open := []int{start}; closed := map[int]bool{}; answer := "none"
    for len(open) > 0 { best := 0; for k := 1; k < len(open); k++ { if g[open[k]]+h(open[k]) < g[open[best]]+h(open[best]) || (g[open[k]]+h(open[k]) == g[open[best]]+h(open[best]) && h(open[k]) < h(open[best])) { best = k } }
        u := open[best]; open = append(open[:best], open[best+1:]...); if u == goal { answer = strconv.Itoa(g[u]); break }; closed[u] = true; r, c := u/cols, u%cols
        for _, d := range [][2]int{{-1, 0}, {0, 1}, {1, 0}, {0, -1}} { vr, vc := r+d[0], c+d[1]; if vr < 0 || vc < 0 || vr >= len(rows) || vc >= cols { continue }; v := vr*cols + vc; if walls[v] || closed[v] { continue }; if cur, ok := g[v]; !ok || g[u]+1 < cur { g[v] = g[u] + 1; has := false; for _, x := range open { if x == v { has = true } }; if !has { open = append(open, v) } } } }
    fmt.Println(answer) }
`,
  fibonacci: `${useHead}
func main() { n, _ := strconv.Atoi(strings.TrimSpace(strings.SplitN(readAll(), ":", 2)[1])); f := []int{0, 1}; for i := 2; i <= n; i++ { f = append(f, f[i-1]+f[i-2]) }; fmt.Println(f[n]) }
`,
  knapsack: keyed(`    w, v := ints(keys["weights"]), ints(keys["values"]); cap, _ := strconv.Atoi(keys["capacity"]); k := make([][]int, len(w)+1); for i := range k { k[i] = make([]int, cap+1) }
    for i := 1; i <= len(w); i++ { for c := 0; c <= cap; c++ { k[i][c] = k[i-1][c]; if w[i-1] <= c && k[i-1][c-w[i-1]]+v[i-1] > k[i][c] { k[i][c] = k[i-1][c-w[i-1]] + v[i-1] } } }
    fmt.Println(k[len(w)][cap])`),
  lcs: keyed(`    x, y := keys["a"], keys["b"]; c := make([][]int, len(x)+1); for i := range c { c[i] = make([]int, len(y)+1) }
    for i := 1; i <= len(x); i++ { for j := 1; j <= len(y); j++ { if x[i-1] == y[j-1] { c[i][j] = c[i-1][j-1] + 1 } else if c[i-1][j] >= c[i][j-1] { c[i][j] = c[i-1][j] } else { c[i][j] = c[i][j-1] } } }
    i, j, s := len(x), len(y), ""; for i > 0 && j > 0 { if x[i-1] == y[j-1] { s = x[i-1:i] + s; i--; j-- } else if c[i-1][j] >= c[i][j-1] { i-- } else { j-- } }; fmt.Println(s)`),
  'edit-distance': keyed(`    a, b := keys["a"], keys["b"]; d := make([][]int, len(a)+1); for i := range d { d[i] = make([]int, len(b)+1); d[i][0] = i }; for j := range d[0] { d[0][j] = j }
    for i := 1; i <= len(a); i++ { for j := 1; j <= len(b); j++ { if a[i-1] == b[j-1] { d[i][j] = d[i-1][j-1] } else { m := d[i-1][j]; if d[i][j-1] < m { m = d[i][j-1] }; if d[i-1][j-1] < m { m = d[i-1][j-1] }; d[i][j] = 1 + m } } }
    fmt.Println(d[len(a)][len(b)])`),
  kmp: keyed(`    t, p := keys["text"], keys["pattern"]; lps := make([]int, len(p)); length, k := 0, 1
    for k < len(p) { if p[k] == p[length] { length++; lps[k] = length; k++ } else if length > 0 { length = lps[length-1] } else { lps[k] = 0; k++ } }
    found := []int{}; i, j := 0, 0
    for i < len(t) { if t[i] == p[j] { i++; j++; if j == len(p) { found = append(found, i-len(p)); j = lps[j-1] } } else if j > 0 { j = lps[j-1] } else { i++ } }
    if len(found) == 0 { fmt.Println("none") } else { for i, v := range found { if i > 0 { fmt.Print(" ") }; fmt.Print(v) }; fmt.Println() }`),
  'rabin-karp': keyed(`    t, p := keys["text"], keys["pattern"]; d, q := 256, 101; h := 1; for k := 0; k < len(p)-1; k++ { h = h * d % q }
    ph, th := 0, 0; for k := 0; k < len(p); k++ { ph = (d*ph + int(p[k])) % q; th = (d*th + int(t[k])) % q }
    found := []int{}; for s := 0; s <= len(t)-len(p); s++ { if ph == th && t[s:s+len(p)] == p { found = append(found, s) }; if s < len(t)-len(p) { th = (d*(th-int(t[s])*h) + int(t[s+len(p)])) % q; if th < 0 { th += q } } }
    if len(found) == 0 { fmt.Println("none") } else { for i, v := range found { if i > 0 { fmt.Print(" ") }; fmt.Print(v) }; fmt.Println() }`),
  bst: keyed(`    values := ints(strings.Join(rest, " ")); target, _ := strconv.Atoi(keys["search"]); type node struct{ key, left, right int }; nodes := []node{}; root := -1
    for _, key := range values { if root < 0 { nodes = append(nodes, node{key, -1, -1}); root = 0; continue }; cur := root; for { if key == nodes[cur].key { break }; left := key < nodes[cur].key; next := nodes[cur].right; if left { next = nodes[cur].left }; if next < 0 { nodes = append(nodes, node{key, -1, -1}); if left { nodes[cur].left = len(nodes) - 1 } else { nodes[cur].right = len(nodes) - 1 }; break }; cur = next } }
    cur, answer := root, "not found"; for cur >= 0 { if target == nodes[cur].key { answer = "found"; break }; if target < nodes[cur].key { cur = nodes[cur].left } else { cur = nodes[cur].right } }; fmt.Println(answer)`),
  'tree-traversal': keyed(`    values := ints(strings.Join(rest, " ")); type node struct{ key, left, right int }; nodes := []node{}; root := -1
    for _, key := range values { if root < 0 { nodes = append(nodes, node{key, -1, -1}); root = 0; continue }; cur := root; for { if key == nodes[cur].key { break }; left := key < nodes[cur].key; next := nodes[cur].right; if left { next = nodes[cur].left }; if next < 0 { nodes = append(nodes, node{key, -1, -1}); if left { nodes[cur].left = len(nodes) - 1 } else { nodes[cur].right = len(nodes) - 1 }; break }; cur = next } }
    var walk func(int, int, *[]int); walk = func(cur, order int, out *[]int) { if cur < 0 { return }; if order == 0 { *out = append(*out, nodes[cur].key) }; walk(nodes[cur].left, order, out); if order == 1 { *out = append(*out, nodes[cur].key) }; walk(nodes[cur].right, order, out); if order == 2 { *out = append(*out, nodes[cur].key) } }
    show := func(o []int) { for i, v := range o { if i > 0 { fmt.Print(" ") }; fmt.Print(v) }; fmt.Println() }
    for order := 0; order < 3; order++ { out := []int{}; walk(root, order, &out); show(out) }
    q, level := []int{root}, []int{}; for len(q) > 0 { cur := q[0]; q = q[1:]; level = append(level, nodes[cur].key); if nodes[cur].left >= 0 { q = append(q, nodes[cur].left) }; if nodes[cur].right >= 0 { q = append(q, nodes[cur].right) } }; show(level)`),
  'n-queens': keyed(`    n, _ := strconv.Atoi(keys["n"]); if n == 0 { n, _ = strconv.Atoi(rest[0]) }; mode := strings.ToLower(keys["mode"]); if mode == "" { mode = "first" }
    queens := make([]int, n); for i := range queens { queens[i] = -1 }; solutions := [][]int{}; abs := func(x int) int { if x < 0 { return -x }; return x }
    safe := func(row, col int) bool { for r := 0; r < row; r++ { if queens[r] == col || abs(queens[r]-col) == row-r { return false } }; return true }
    var solve func(int) bool; solve = func(row int) bool { if row == n { cp := append([]int{}, queens...); solutions = append(solutions, cp); return mode != "first" }; for col := 0; col < n; col++ { if safe(row, col) { queens[row] = col; if !solve(row + 1) { return false } } }; return true }
    solve(0); if mode == "all" { fmt.Println(len(solutions)) } else if len(solutions) == 0 { fmt.Println("none") } else { for i, v := range solutions[0] { if i > 0 { fmt.Print(" ") }; fmt.Print(v) }; fmt.Println() }`),
  gcd: keyed(`    a, _ := strconv.Atoi(keys["a"]); b, _ := strconv.Atoi(keys["b"]); for b != 0 { a, b = b, a%b }; fmt.Println(a)`),
  sieve: keyed(`    n, _ := strconv.Atoi(keys["n"]); prime := make([]bool, n+1); for i := 2; i <= n; i++ { prime[i] = true }; for p := 2; p*p <= n; p++ { if prime[p] { for m := p * p; m <= n; m += p { prime[m] = false } } }
    first := true; for p := 2; p <= n; p++ { if prime[p] { if !first { fmt.Print(" ") }; fmt.Print(p); first = false } }; fmt.Println()`),
  hanoi: keyed(`    n, _ := strconv.Atoi(keys["n"]); fmt.Println((1 << n) - 1)`),
};

function abs(template) { return template; }
