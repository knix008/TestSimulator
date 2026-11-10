// go samples for the classroom algorithms (src/algorithms/classroom.js).
// Each program reads the input box on stdin and prints exactly expectedOutput().
export const go = {
  'grid-bfs': `package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

var rows, cols, start, goal int
var wall []bool

// readGrid reads the grid: S = start, G = goal, # = wall, . = open.
func readGrid() {
	b, _ := io.ReadAll(os.Stdin)
	lines := []string{}
	for _, raw := range strings.Split(string(b), "\\n") {
		if line := strings.TrimSpace(raw); line != "" {
			lines = append(lines, line)
		}
	}
	rows, cols = len(lines), len(lines[0])
	wall = make([]bool, rows*cols)
	for r, line := range lines {
		for c := 0; c < cols; c++ {
			i := r*cols + c
			switch line[c] {
			case 'S', 's':
				start = i
			case 'G', 'g':
				goal = i
			case '#':
				wall[i] = true
			}
		}
	}
}

// neighbours returns the cells next to u in the order up, right, down, left.
func neighbours(u int) []int {
	r, c := u/cols, u%cols
	out := []int{}
	for _, d := range [][2]int{{-1, 0}, {0, 1}, {1, 0}, {0, -1}} {
		vr, vc := r+d[0], c+d[1]
		if vr >= 0 && vc >= 0 && vr < rows && vc < cols {
			out = append(out, vr*cols+vc)
		}
	}
	return out
}

func main() {
	readGrid()
	dist := make([]int, rows*cols)
	for i := range dist {
		dist[i] = -1
	}
	dist[start] = 0
	queue := []int{start} // @1
	for len(queue) > 0 { // @2
		u := queue[0] // @3
		queue = queue[1:]
		if u == goal { // @4
			fmt.Println(dist[u])
			return
		}
		for _, v := range neighbours(u) { // @5
			if !wall[v] && dist[v] < 0 { // @6
				dist[v] = dist[u] + 1
				queue = append(queue, v) // @7
			}
		}
	}
	fmt.Println("none") // @8
}
`,

  'greedy-best-first': `package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

var rows, cols, start, goal int
var wall []bool

// readGrid reads the grid: S = start, G = goal, # = wall, . = open.
func readGrid() {
	b, _ := io.ReadAll(os.Stdin)
	lines := []string{}
	for _, raw := range strings.Split(string(b), "\\n") {
		if line := strings.TrimSpace(raw); line != "" {
			lines = append(lines, line)
		}
	}
	rows, cols = len(lines), len(lines[0])
	wall = make([]bool, rows*cols)
	for r, line := range lines {
		for c := 0; c < cols; c++ {
			i := r*cols + c
			switch line[c] {
			case 'S', 's':
				start = i
			case 'G', 'g':
				goal = i
			case '#':
				wall[i] = true
			}
		}
	}
}

// neighbours returns the cells next to u in the order up, right, down, left.
func neighbours(u int) []int {
	r, c := u/cols, u%cols
	out := []int{}
	for _, d := range [][2]int{{-1, 0}, {0, 1}, {1, 0}, {0, -1}} {
		vr, vc := r+d[0], c+d[1]
		if vr >= 0 && vc >= 0 && vr < rows && vc < cols {
			out = append(out, vr*cols+vc)
		}
	}
	return out
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// h is the Manhattan distance from cell i to the goal.
func h(i int) int { return abs(i/cols-goal/cols) + abs(i%cols-goal%cols) }

func main() {
	readGrid()
	parent := make([]int, rows*cols)
	seen := make([]bool, rows*cols)
	open := []int{start}
	seen[start] = true // @1
	for len(open) > 0 { // @2
		best := 0
		for k := 1; k < len(open); k++ {
			if h(open[k]) < h(open[best]) { // @3
				best = k
			}
		}
		u := open[best]
		if u == goal { // @4
			length := 0
			for x := goal; x != start; x = parent[x] {
				length++
			}
			fmt.Println(length)
			return
		}
		open = append(open[:best], open[best+1:]...) // @5
		for _, v := range neighbours(u) { // @6
			if !wall[v] && !seen[v] {
				seen[v] = true
				parent[v] = u
				open = append(open, v) // @7
			}
		}
	}
	fmt.Println("none") // @8
}
`,

  'maze-dfs': `package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

var rows, cols, start, goal int
var wall, visited []bool
var parent []int

// readGrid reads the grid: S = start, G = goal, # = wall, . = open.
func readGrid() {
	b, _ := io.ReadAll(os.Stdin)
	lines := []string{}
	for _, raw := range strings.Split(string(b), "\\n") {
		if line := strings.TrimSpace(raw); line != "" {
			lines = append(lines, line)
		}
	}
	rows, cols = len(lines), len(lines[0])
	wall = make([]bool, rows*cols)
	for r, line := range lines {
		for c := 0; c < cols; c++ {
			i := r*cols + c
			switch line[c] {
			case 'S', 's':
				start = i
			case 'G', 'g':
				goal = i
			case '#':
				wall[i] = true
			}
		}
	}
}

// neighbours returns the cells next to u in the order up, right, down, left.
func neighbours(u int) []int {
	r, c := u/cols, u%cols
	out := []int{}
	for _, d := range [][2]int{{-1, 0}, {0, 1}, {1, 0}, {0, -1}} {
		vr, vc := r+d[0], c+d[1]
		if vr >= 0 && vc >= 0 && vr < rows && vc < cols {
			out = append(out, vr*cols+vc)
		}
	}
	return out
}

func dfs(u int) bool { // @0
	if u == goal { // @1
		return true
	}
	visited[u] = true // @2
	for _, v := range neighbours(u) { // @3
		if !wall[v] && !visited[v] { // @4
			parent[v] = u // @5
			if dfs(v) { // @6
				return true
			}
		}
	}
	return false // @7
}

func main() {
	readGrid()
	visited = make([]bool, rows*cols)
	parent = make([]int, rows*cols)
	if dfs(start) {
		length := 0
		for x := goal; x != start; x = parent[x] {
			length++
		}
		fmt.Println(length)
	} else {
		fmt.Println("none")
	}
}
`,

  'subset-sum': `package main

import (
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

// readKeyed turns "key: value" lines into a map (keys lower-case; # comments and blank lines are ignored).
func readKeyed(text string) map[string]string {
	keys := map[string]string{}
	for _, raw := range strings.Split(text, "\\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
		if head, tail, ok := strings.Cut(line, ":"); ok && head != "" {
			keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
		}
	}
	return keys
}

// ints reads integers separated by spaces or commas.
func ints(s string) []int {
	out := []int{}
	for _, f := range strings.Fields(strings.ReplaceAll(s, ",", " ")) {
		n, _ := strconv.Atoi(f)
		out = append(out, n)
	}
	return out
}

var a []int
var target int
var taken []bool

func solve(i, sum int) bool { // @0
	if sum == target { // @1
		return true
	}
	if i == len(a) { // @2
		return false
	}
	if sum+a[i] <= target { // @3
		taken[i] = true
		if solve(i+1, sum+a[i]) { // @4
			return true
		}
		taken[i] = false // @5
	}
	return solve(i+1, sum) // @6
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	keys := readKeyed(string(b))
	a = ints(keys["values"])
	target, _ = strconv.Atoi(keys["target"])
	taken = make([]bool, len(a))
	if solve(0, 0) {
		out := []string{}
		for i, v := range a {
			if taken[i] {
				out = append(out, strconv.Itoa(v))
			}
		}
		fmt.Println(strings.Join(out, " "))
	} else {
		fmt.Println("none")
	}
}
`,

  'permutations': `package main

import (
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

// readKeyed turns "key: value" lines into a map (keys lower-case; # comments and blank lines are ignored).
func readKeyed(text string) map[string]string {
	keys := map[string]string{}
	for _, raw := range strings.Split(text, "\\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
		if head, tail, ok := strings.Cut(line, ":"); ok && head != "" {
			keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
		}
	}
	return keys
}

// ints reads integers separated by spaces or commas.
func ints(s string) []int {
	out := []int{}
	for _, f := range strings.Fields(strings.ReplaceAll(s, ",", " ")) {
		n, _ := strconv.Atoi(f)
		out = append(out, n)
	}
	return out
}

var a []int
var used []bool
var cur []string

func permute() { // @0
	if len(cur) == len(a) { // @1
		fmt.Println(strings.Join(cur, " "))
		return
	}
	for i := 0; i < len(a); i++ { // @2
		if used[i] { // @3
			continue
		}
		used[i] = true
		cur = append(cur, strconv.Itoa(a[i])) // @4
		permute() // @5
		cur = cur[:len(cur)-1]
		used[i] = false // @6
	}
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	text := string(b)
	items, ok := readKeyed(text)["items"]
	if !ok {
		items = text
	}
	a = ints(items)
	used = make([]bool, len(a))
	permute()
}
`,

  'sudoku': `package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

var grid [81]int

// clash reports whether digit d is already in the row, column or 3x3 box of cell i (not counting cell i).
func clash(i, d int) bool {
	r, c := i/9, i%9
	for k := 0; k < 9; k++ {
		if r*9+k != i && grid[r*9+k] == d {
			return true
		}
		if k*9+c != i && grid[k*9+c] == d {
			return true
		}
	}
	br, bc := r-r%3, c-c%3
	for y := br; y < br+3; y++ {
		for x := bc; x < bc+3; x++ {
			if y*9+x != i && grid[y*9+x] == d {
				return true
			}
		}
	}
	return false
}

func solve() bool { // @0
	i := 0
	for i < 81 && grid[i] != 0 {
		i++
	}
	if i == 81 { // @1
		return true
	}
	for d := 1; d <= 9; d++ { // @2
		if clash(i, d) { // @3
			continue
		}
		grid[i] = d // @4
		if solve() { // @5
			return true
		}
		grid[i] = 0 // @6
	}
	return false // @7
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	n := 0
	for _, ch := range string(b) {
		if ch == '.' || (ch >= '0' && ch <= '9') { // spaces, | + - and line breaks are skipped
			if n < 81 {
				grid[n] = int(ch - '0')
				if ch == '.' {
					grid[n] = 0
				}
			}
			n++
		}
	}
	ok := true
	for i := 0; i < 81; i++ {
		if grid[i] != 0 && clash(i, grid[i]) {
			ok = false
		}
	}
	if ok && solve() {
		for r := 0; r < 9; r++ {
			row := strings.Builder{}
			for c := 0; c < 9; c++ {
				row.WriteByte(byte('0' + grid[r*9+c]))
			}
			fmt.Println(row.String())
		}
	} else {
		fmt.Println("none")
	}
}
`,

  'huffman': `package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

// readKeyed turns "key: value" lines into a map (keys lower-case; # comments and blank lines are ignored).
func readKeyed(text string) map[string]string {
	keys := map[string]string{}
	for _, raw := range strings.Split(text, "\\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
		if head, tail, ok := strings.Cut(line, ":"); ok && head != "" {
			keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
		}
	}
	return keys
}

type Node struct {
	freq        int
	left, right *Node
}

// bits sums freq x code length over the leaves below node (depth = code length).
func bits(node *Node, depth int) int {
	if node.left == nil {
		if depth == 0 { // a lone symbol still needs 1 bit
			depth = 1
		}
		return node.freq * depth
	}
	return bits(node.left, depth+1) + bits(node.right, depth+1)
}

// popMin removes and returns the tree with the smallest frequency.
func popMin(queue []*Node) (*Node, []*Node) {
	best := 0
	for k := 1; k < len(queue); k++ {
		if queue[k].freq < queue[best].freq {
			best = k
		}
	}
	node := queue[best]
	return node, append(queue[:best], queue[best+1:]...)
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	text, ok := readKeyed(string(b))["text"]
	if !ok {
		text = strings.TrimSpace(string(b))
	}
	freq := map[rune]int{}
	order := []rune{}
	for _, ch := range text { // @1
		if freq[ch] == 0 {
			order = append(order, ch)
		}
		freq[ch]++
	}
	queue := []*Node{}
	for _, ch := range order {
		queue = append(queue, &Node{freq: freq[ch]}) // @2
	}
	for len(queue) > 1 { // @3
		var x, y *Node
		x, queue = popMin(queue)
		y, queue = popMin(queue) // @4
		z := &Node{freq: x.freq + y.freq, left: x, right: y} // @5
		queue = append(queue, z) // @6
	}
	fmt.Println(bits(queue[0], 0)) // @8
}
`,

  'fractional-knapsack': `package main

import (
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
)

// readKeyed turns "key: value" lines into a map (keys lower-case; # comments and blank lines are ignored).
func readKeyed(text string) map[string]string {
	keys := map[string]string{}
	for _, raw := range strings.Split(text, "\\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
		if head, tail, ok := strings.Cut(line, ":"); ok && head != "" {
			keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
		}
	}
	return keys
}

// ints reads integers separated by spaces or commas.
func ints(s string) []int64 {
	out := []int64{}
	for _, f := range strings.Fields(strings.ReplaceAll(s, ",", " ")) {
		n, _ := strconv.ParseInt(f, 10, 64)
		out = append(out, n)
	}
	return out
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	keys := readKeyed(string(b))
	w, v := ints(keys["weights"]), ints(keys["values"])
	room, _ := strconv.ParseInt(keys["capacity"], 10, 64)
	order := make([]int, len(w))
	for i := range order {
		order[i] = i
	}
	// Largest value per weight first: compare v[b]/w[b] with v[a]/w[a] by cross-multiplying.
	sort.SliceStable(order, func(x, y int) bool { // @1
		a, b := order[x], order[y]
		return v[a]*w[b] > v[b]*w[a]
	})
	var num, den int64 = 0, 1 // the total value is kept exactly as num / den
	for _, i := range order { // @2
		if room == 0 {
			break
		}
		if w[i] <= room { // @3
			room -= w[i]
			num += v[i] * den
		} else { // @4
			num = num*w[i] + v[i]*room*den
			den *= w[i]
			room = 0
			break
		}
	}
	cents := (2*100*num + den) / (2 * den) // round half up to 2 decimals
	fmt.Printf("%d.%02d\\n", cents/100, cents%100) // @5
}
`,

  'job-sequencing': `package main

import (
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
)

func main() {
	// One job per line: "deadline profit". Jobs are J1, J2, ... in input order.
	b, _ := io.ReadAll(os.Stdin)
	deadline, profit := []int{}, []int{}
	for _, raw := range strings.Split(string(b), "\\n") {
		p := strings.Fields(strings.ReplaceAll(raw, ",", " "))
		if len(p) < 2 {
			continue
		}
		d, _ := strconv.Atoi(p[0])
		v, _ := strconv.Atoi(p[1])
		deadline, profit = append(deadline, d), append(profit, v)
	}
	slots := 0
	for _, d := range deadline {
		slots = max(slots, d)
	}
	order := make([]int, len(profit))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(x, y int) bool { return profit[order[x]] > profit[order[y]] }) // @1
	slot := make([]int, slots+1)
	for t := range slot {
		slot[t] = -1
	}
	total := 0
	for _, j := range order { // @2
		for t := min(deadline[j], slots); t >= 1; t-- { // @3
			if slot[t] < 0 { // @4
				slot[t] = j
				total += profit[j]
				break
			}
		}
	}
	sequence := []string{}
	for t := 1; t <= slots; t++ {
		if slot[t] >= 0 {
			sequence = append(sequence, "J"+strconv.Itoa(slot[t]+1))
		}
	}
	fmt.Println(strings.Join(sequence, " ")) // @6
	fmt.Println(total)
}
`,

  'avl-tree': `package main

import (
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

// readKeyed turns "key: value" lines into a map (keys lower-case; # comments and blank lines are ignored).
func readKeyed(text string) map[string]string {
	keys := map[string]string{}
	for _, raw := range strings.Split(text, "\\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
		if head, tail, ok := strings.Cut(line, ":"); ok && head != "" {
			keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
		}
	}
	return keys
}

// ints reads integers separated by spaces or commas.
func ints(s string) []int {
	out := []int{}
	for _, f := range strings.Fields(strings.ReplaceAll(s, ",", " ")) {
		n, _ := strconv.Atoi(f)
		out = append(out, n)
	}
	return out
}

type Node struct {
	key, height int
	left, right *Node
}

func height(n *Node) int {
	if n == nil {
		return 0
	}
	return n.height
}

func fix(n *Node) { n.height = 1 + max(height(n.left), height(n.right)) }

func rotateRight(y *Node) *Node {
	x := y.left
	y.left, x.right = x.right, y
	fix(y)
	fix(x)
	return x
}

func rotateLeft(y *Node) *Node {
	x := y.right
	y.right, x.left = x.left, y
	fix(y)
	fix(x)
	return x
}

func insert(node *Node, key int) *Node { // @0
	if node == nil { // @1
		return &Node{key: key, height: 1}
	}
	if key < node.key { // @2
		node.left = insert(node.left, key)
	} else if key > node.key { // @3
		node.right = insert(node.right, key)
	} else { // @4
		return node
	}
	fix(node)
	b := height(node.left) - height(node.right) // @5
	if b > 1 && key < node.left.key { // @6
		return rotateRight(node)
	}
	if b < -1 && key > node.right.key { // @7
		return rotateLeft(node)
	}
	if b > 1 { // @8
		node.left = rotateLeft(node.left)
		return rotateRight(node)
	}
	if b < -1 { // @9
		node.right = rotateRight(node.right)
		return rotateLeft(node)
	}
	return node // @10
}

func preorder(n *Node, out *[]string) {
	if n == nil {
		return
	}
	*out = append(*out, strconv.Itoa(n.key))
	preorder(n.left, out)
	preorder(n.right, out)
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	text := string(b)
	values, ok := readKeyed(text)["values"]
	if !ok {
		values = text
	}
	var root *Node
	for _, key := range ints(values) {
		root = insert(root, key)
	}
	out := []string{}
	preorder(root, &out)
	fmt.Println(strings.Join(out, " "))
}
`,

  'binary-heap': `package main

import (
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

// readKeyed turns "key: value" lines into a map (keys lower-case; # comments and blank lines are ignored).
func readKeyed(text string) map[string]string {
	keys := map[string]string{}
	for _, raw := range strings.Split(text, "\\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
		if head, tail, ok := strings.Cut(line, ":"); ok && head != "" {
			keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
		}
	}
	return keys
}

// ints reads integers separated by spaces or commas.
func ints(s string) []int {
	out := []int{}
	for _, f := range strings.Fields(strings.ReplaceAll(s, ",", " ")) {
		n, _ := strconv.Atoi(f)
		out = append(out, n)
	}
	return out
}

var a []int
var n int

func insert(x int) { // @0
	a = append(a, x)
	i := n
	n++ // @1
	for i > 0 && a[(i-1)/2] > a[i] { // @2
		p := (i - 1) / 2
		a[i], a[p] = a[p], a[i]
		i = p // @3
	}
}

func extractMin() int { // @4
	min := a[0]
	a[0], a[n-1] = a[n-1], a[0]
	n-- // @5
	i := 0
	for 2*i+1 < n { // @6
		c := 2*i + 1
		if c+1 < n && a[c+1] < a[c] {
			c++
		}
		if a[c] >= a[i] {
			break
		}
		a[i], a[c] = a[c], a[i]
		i = c // @7
	}
	return min // @8
}

func join(values []int) string {
	out := []string{}
	for _, v := range values {
		out = append(out, strconv.Itoa(v))
	}
	return strings.Join(out, " ")
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	text := string(b)
	keys := readKeyed(text)
	values, ok := keys["values"]
	if !ok {
		values = text
	}
	extract := 1
	if e, ok := keys["extract"]; ok {
		extract, _ = strconv.Atoi(e)
	}
	for _, x := range ints(values) {
		insert(x)
	}
	fmt.Println(join(a))
	out := []int{}
	for k := 0; k < extract; k++ {
		out = append(out, extractMin())
	}
	fmt.Println(join(out))
}
`,

  'trie': `package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

// readKeyed turns "key: value" lines into a map (keys lower-case; # comments and blank lines are ignored).
func readKeyed(text string) map[string]string {
	keys := map[string]string{}
	for _, raw := range strings.Split(text, "\\n") {
		line := strings.TrimSpace(strings.SplitN(raw, "#", 2)[0])
		if head, tail, ok := strings.Cut(line, ":"); ok && head != "" {
			keys[strings.ToLower(strings.TrimSpace(head))] = strings.TrimSpace(tail)
		}
	}
	return keys
}

type Node struct {
	child [26]*Node
	end   bool
}

var root = &Node{}

func insert(word string) { // @0
	node := root // @1
	for _, ch := range word { // @2
		k := ch - 'a'
		if node.child[k] == nil { // @3
			node.child[k] = &Node{}
		}
		node = node.child[k] // @4
	}
	node.end = true // @5
}

// collect appends every word below node, visiting children a to z.
func collect(node *Node, prefix string, found *[]string) {
	if node.end {
		*found = append(*found, prefix)
	}
	for k := 0; k < 26; k++ {
		if node.child[k] != nil {
			collect(node.child[k], prefix+string(rune('a'+k)), found)
		}
	}
}

func main() {
	b, _ := io.ReadAll(os.Stdin)
	keys := readKeyed(string(b))
	for _, word := range strings.Fields(strings.ReplaceAll(keys["words"], ",", " ")) {
		insert(word)
	}
	find := keys["find"]
	node := root
	for _, ch := range find { // @7
		node = node.child[ch-'a']
		if node == nil {
			fmt.Println("none")
			return
		}
	}
	found := []string{}
	collect(node, find, &found) // @8
	if len(found) == 0 {
		fmt.Println("none")
	} else {
		fmt.Println(strings.Join(found, " "))
	}
}
`,
};
