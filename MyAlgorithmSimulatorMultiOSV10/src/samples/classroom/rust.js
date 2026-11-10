// rust samples for the classroom algorithms (src/algorithms/classroom.js).
// Each program reads the input box on stdin and prints exactly expectedOutput().
export const rust = {
  'grid-bfs': `use std::collections::VecDeque;
use std::io::Read;

struct Grid { rows: usize, cols: usize, start: usize, goal: usize, wall: Vec<bool> }

// Read the grid: S = start, G = goal, # = wall, . = open.
fn read_grid() -> Grid {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    let (rows, cols) = (lines.len(), lines[0].len());
    let mut g = Grid { rows, cols, start: 0, goal: 0, wall: vec![false; rows * cols] };
    for (r, line) in lines.iter().enumerate() {
        for (c, ch) in line.chars().enumerate() {
            let i = r * cols + c;
            match ch {
                'S' | 's' => g.start = i,
                'G' | 'g' => g.goal = i,
                '#' => g.wall[i] = true,
                _ => {}
            }
        }
    }
    g
}

impl Grid {
    // Neighbours of cell u in the order up, right, down, left.
    fn neighbours(&self, u: usize) -> Vec<usize> {
        let (r, c) = ((u / self.cols) as i64, (u % self.cols) as i64);
        let mut out = Vec::new();
        for (dr, dc) in [(-1, 0), (0, 1), (1, 0), (0, -1)] {
            let (vr, vc) = (r + dr, c + dc);
            if vr >= 0 && vc >= 0 && vr < self.rows as i64 && vc < self.cols as i64 {
                out.push(vr as usize * self.cols + vc as usize);
            }
        }
        out
    }
}

fn main() {
    let g = read_grid();
    let mut dist: Vec<i64> = vec![-1; g.rows * g.cols];
    let mut queue = VecDeque::new();
    dist[g.start] = 0; queue.push_back(g.start); // @1
    while let Some(u) = queue.pop_front() { // @3
        if u == g.goal { println!("{}", dist[u]); return; } // @4
        for v in g.neighbours(u) { // @5
            if !g.wall[v] && dist[v] < 0 { // @6
                dist[v] = dist[u] + 1; queue.push_back(v); // @7
            }
        }
    }
    println!("none"); // @8
}
`,

  'greedy-best-first': `use std::io::Read;

struct Grid { rows: usize, cols: usize, start: usize, goal: usize, wall: Vec<bool> }

// Read the grid: S = start, G = goal, # = wall, . = open.
fn read_grid() -> Grid {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    let (rows, cols) = (lines.len(), lines[0].len());
    let mut g = Grid { rows, cols, start: 0, goal: 0, wall: vec![false; rows * cols] };
    for (r, line) in lines.iter().enumerate() {
        for (c, ch) in line.chars().enumerate() {
            let i = r * cols + c;
            match ch {
                'S' | 's' => g.start = i,
                'G' | 'g' => g.goal = i,
                '#' => g.wall[i] = true,
                _ => {}
            }
        }
    }
    g
}

impl Grid {
    // Neighbours of cell u in the order up, right, down, left.
    fn neighbours(&self, u: usize) -> Vec<usize> {
        let (r, c) = ((u / self.cols) as i64, (u % self.cols) as i64);
        let mut out = Vec::new();
        for (dr, dc) in [(-1, 0), (0, 1), (1, 0), (0, -1)] {
            let (vr, vc) = (r + dr, c + dc);
            if vr >= 0 && vc >= 0 && vr < self.rows as i64 && vc < self.cols as i64 {
                out.push(vr as usize * self.cols + vc as usize);
            }
        }
        out
    }

    // Manhattan distance from cell i to the goal.
    fn h(&self, i: usize) -> usize {
        (i / self.cols).abs_diff(self.goal / self.cols) + (i % self.cols).abs_diff(self.goal % self.cols)
    }
}

fn main() {
    let g = read_grid();
    let mut parent = vec![0usize; g.rows * g.cols];
    let mut seen = vec![false; g.rows * g.cols];
    let mut open = vec![g.start];
    seen[g.start] = true; // @1
    while !open.is_empty() { // @2
        let mut best = 0;
        for k in 1..open.len() {
            if g.h(open[k]) < g.h(open[best]) { best = k; } // @3
        }
        let u = open[best];
        if u == g.goal { // @4
            let mut length = 0;
            let mut x = g.goal;
            while x != g.start { x = parent[x]; length += 1; }
            println!("{length}");
            return;
        }
        open.remove(best); // @5
        for v in g.neighbours(u) { // @6
            if !g.wall[v] && !seen[v] { seen[v] = true; parent[v] = u; open.push(v); } // @7
        }
    }
    println!("none"); // @8
}
`,

  'maze-dfs': `use std::io::Read;

struct Grid { rows: usize, cols: usize, start: usize, goal: usize, wall: Vec<bool> }

// Read the grid: S = start, G = goal, # = wall, . = open.
fn read_grid() -> Grid {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    let (rows, cols) = (lines.len(), lines[0].len());
    let mut g = Grid { rows, cols, start: 0, goal: 0, wall: vec![false; rows * cols] };
    for (r, line) in lines.iter().enumerate() {
        for (c, ch) in line.chars().enumerate() {
            let i = r * cols + c;
            match ch {
                'S' | 's' => g.start = i,
                'G' | 'g' => g.goal = i,
                '#' => g.wall[i] = true,
                _ => {}
            }
        }
    }
    g
}

impl Grid {
    // Neighbours of cell u in the order up, right, down, left.
    fn neighbours(&self, u: usize) -> Vec<usize> {
        let (r, c) = ((u / self.cols) as i64, (u % self.cols) as i64);
        let mut out = Vec::new();
        for (dr, dc) in [(-1, 0), (0, 1), (1, 0), (0, -1)] {
            let (vr, vc) = (r + dr, c + dc);
            if vr >= 0 && vc >= 0 && vr < self.rows as i64 && vc < self.cols as i64 {
                out.push(vr as usize * self.cols + vc as usize);
            }
        }
        out
    }
}

fn dfs(g: &Grid, u: usize, visited: &mut Vec<bool>, parent: &mut Vec<usize>) -> bool { // @0
    if u == g.goal { return true; } // @1
    visited[u] = true; // @2
    for v in g.neighbours(u) { // @3
        if !g.wall[v] && !visited[v] { // @4
            parent[v] = u; // @5
            if dfs(g, v, visited, parent) { return true; } // @6
        }
    }
    false // @7
}

fn main() {
    let g = read_grid();
    let mut visited = vec![false; g.rows * g.cols];
    let mut parent = vec![0usize; g.rows * g.cols];
    if dfs(&g, g.start, &mut visited, &mut parent) {
        let mut length = 0;
        let mut x = g.goal;
        while x != g.start { x = parent[x]; length += 1; }
        println!("{length}");
    } else {
        println!("none");
    }
}
`,

  'subset-sum': `use std::collections::HashMap;
use std::io::Read;

// "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
fn read_keyed(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            if !head.trim().is_empty() { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); }
        }
    }
    keys
}

// Integers separated by spaces or commas.
fn ints(s: &str) -> Vec<i64> {
    s.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect()
}

fn solve(a: &[i64], target: i64, taken: &mut Vec<bool>, i: usize, sum: i64) -> bool { // @0
    if sum == target { return true; } // @1
    if i == a.len() { return false; } // @2
    if sum + a[i] <= target { // @3
        taken[i] = true;
        if solve(a, target, taken, i + 1, sum + a[i]) { return true; } // @4
        taken[i] = false; // @5
    }
    solve(a, target, taken, i + 1, sum) // @6
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let keys = read_keyed(&text);
    let a = ints(keys.get("values").map(String::as_str).unwrap_or(""));
    let target: i64 = keys.get("target").and_then(|t| t.parse().ok()).unwrap_or(0);
    let mut taken = vec![false; a.len()];
    if solve(&a, target, &mut taken, 0, 0) {
        let picked: Vec<String> = (0..a.len()).filter(|&i| taken[i]).map(|i| a[i].to_string()).collect();
        println!("{}", picked.join(" "));
    } else {
        println!("none");
    }
}
`,

  'permutations': `use std::collections::HashMap;
use std::io::Read;

// "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
fn read_keyed(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            if !head.trim().is_empty() { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); }
        }
    }
    keys
}

// Integers separated by spaces or commas.
fn ints(s: &str) -> Vec<i64> {
    s.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect()
}

fn permute(a: &[i64], used: &mut Vec<bool>, cur: &mut Vec<String>) { // @0
    if cur.len() == a.len() { // @1
        println!("{}", cur.join(" "));
        return;
    }
    for i in 0..a.len() { // @2
        if used[i] { continue; } // @3
        used[i] = true; cur.push(a[i].to_string()); // @4
        permute(a, used, cur); // @5
        cur.pop(); used[i] = false; // @6
    }
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let keys = read_keyed(&text);
    let a = ints(keys.get("items").map(String::as_str).unwrap_or(&text));
    let mut used = vec![false; a.len()];
    permute(&a, &mut used, &mut Vec::new());
}
`,

  'sudoku': `use std::io::Read;

// Is digit d already in the row, column or 3x3 box of cell i (not counting cell i)?
fn clash(grid: &[u8; 81], i: usize, d: u8) -> bool {
    let (r, c) = (i / 9, i % 9);
    for k in 0..9 {
        if r * 9 + k != i && grid[r * 9 + k] == d { return true; }
        if k * 9 + c != i && grid[k * 9 + c] == d { return true; }
    }
    let (br, bc) = (r - r % 3, c - c % 3);
    for y in br..br + 3 {
        for x in bc..bc + 3 {
            if y * 9 + x != i && grid[y * 9 + x] == d { return true; }
        }
    }
    false
}

fn solve(grid: &mut [u8; 81]) -> bool { // @0
    let i = match grid.iter().position(|&v| v == 0) {
        Some(i) => i,
        None => return true, // @1
    };
    for d in 1..=9 { // @2
        if clash(grid, i, d) { continue; } // @3
        grid[i] = d; // @4
        if solve(grid) { return true; } // @5
        grid[i] = 0; // @6
    }
    false // @7
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let mut grid = [0u8; 81];
    let mut n = 0;
    // Spaces, | + - and line breaks are skipped; . or 0 is a blank.
    for ch in text.chars() {
        if (ch == '.' || ch.is_ascii_digit()) && n < 81 {
            grid[n] = if ch == '.' { 0 } else { ch as u8 - b'0' };
            n += 1;
        }
    }
    let ok = (0..81).all(|i| grid[i] == 0 || !clash(&grid, i, grid[i]));
    if ok && solve(&mut grid) {
        for r in 0..9 {
            let row: String = grid[r * 9..r * 9 + 9].iter().map(|d| (b'0' + d) as char).collect();
            println!("{row}");
        }
    } else {
        println!("none");
    }
}
`,

  'huffman': `use std::collections::HashMap;
use std::io::Read;

// "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
fn read_keyed(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            if !head.trim().is_empty() { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); }
        }
    }
    keys
}

// A tree node: leaves have no children. Children are indices into the node list.
struct Node { freq: usize, left: Option<usize>, right: Option<usize> }

// Sum of freq x code length over the leaves below node (depth = code length).
fn bits(nodes: &[Node], id: usize, depth: usize) -> usize {
    match (nodes[id].left, nodes[id].right) {
        (Some(l), Some(r)) => bits(nodes, l, depth + 1) + bits(nodes, r, depth + 1),
        _ => nodes[id].freq * depth.max(1), // a lone symbol still needs 1 bit
    }
}

// Remove and return the tree in the queue with the smallest frequency.
fn pop_min(nodes: &[Node], queue: &mut Vec<usize>) -> usize {
    let mut best = 0;
    for k in 1..queue.len() {
        if nodes[queue[k]].freq < nodes[queue[best]].freq { best = k; }
    }
    queue.remove(best)
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).ok();
    let keys = read_keyed(&input);
    let text = keys.get("text").map(String::as_str).unwrap_or(input.trim());
    let mut freq: Vec<(char, usize)> = Vec::new();
    for ch in text.chars() { // @1
        match freq.iter_mut().find(|(c, _)| *c == ch) {
            Some(entry) => entry.1 += 1,
            None => freq.push((ch, 1)),
        }
    }
    let mut nodes: Vec<Node> = Vec::new();
    let mut queue: Vec<usize> = Vec::new();
    for &(_, f) in &freq {
        nodes.push(Node { freq: f, left: None, right: None });
        queue.push(nodes.len() - 1); // @2
    }
    while queue.len() > 1 { // @3
        let x = pop_min(&nodes, &mut queue);
        let y = pop_min(&nodes, &mut queue); // @4
        nodes.push(Node { freq: nodes[x].freq + nodes[y].freq, left: Some(x), right: Some(y) }); // @5
        queue.push(nodes.len() - 1); // @6
    }
    println!("{}", bits(&nodes, queue[0], 0)); // @8
}
`,

  'fractional-knapsack': `use std::collections::HashMap;
use std::io::Read;

// "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
fn read_keyed(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            if !head.trim().is_empty() { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); }
        }
    }
    keys
}

// Integers separated by spaces or commas.
fn ints(s: &str) -> Vec<i64> {
    s.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect()
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let keys = read_keyed(&text);
    let w = ints(keys.get("weights").map(String::as_str).unwrap_or(""));
    let v = ints(keys.get("values").map(String::as_str).unwrap_or(""));
    let mut room: i64 = keys.get("capacity").and_then(|c| c.parse().ok()).unwrap_or(0);
    // Largest value per weight first: compare v[b]/w[b] with v[a]/w[a] by cross-multiplying, ties by index.
    let mut order: Vec<usize> = (0..w.len()).collect();
    order.sort_by(|&a, &b| (v[b] * w[a]).cmp(&(v[a] * w[b])).then(a.cmp(&b))); // @1
    let (mut num, mut den): (i64, i64) = (0, 1); // the total value is kept exactly as num / den
    for i in order { // @2
        if room == 0 { break; }
        if w[i] <= room { // @3
            room -= w[i];
            num += v[i] * den;
        } else { // @4
            num = num * w[i] + v[i] * room * den;
            den *= w[i];
            break;
        }
    }
    let cents = (2 * 100 * num + den) / (2 * den); // round half up to 2 decimals
    println!("{}.{:02}", cents / 100, cents % 100); // @5
}
`,

  'job-sequencing': `use std::io::Read;

fn main() {
    // One job per line: "deadline profit". Jobs are J1, J2, ... in input order.
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let mut jobs: Vec<(usize, i64)> = Vec::new();
    for line in text.lines() {
        let p: Vec<i64> = line.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect();
        if p.len() >= 2 { jobs.push((p[0] as usize, p[1])); }
    }
    let slots = jobs.iter().map(|j| j.0).max().unwrap_or(0);
    let mut order: Vec<usize> = (0..jobs.len()).collect();
    order.sort_by(|&a, &b| jobs[b].1.cmp(&jobs[a].1).then(a.cmp(&b))); // @1
    let mut slot: Vec<Option<usize>> = vec![None; slots + 1];
    let mut profit = 0;
    for j in order { // @2
        for t in (1..=jobs[j].0.min(slots)).rev() { // @3
            if slot[t].is_none() { slot[t] = Some(j); profit += jobs[j].1; break; } // @4
        }
    }
    let sequence: Vec<String> = slot.iter().flatten().map(|j| format!("J{}", j + 1)).collect();
    println!("{}", sequence.join(" ")); // @6
    println!("{profit}");
}
`,

  'avl-tree': `use std::collections::HashMap;
use std::io::Read;

// "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
fn read_keyed(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            if !head.trim().is_empty() { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); }
        }
    }
    keys
}

// Integers separated by spaces or commas.
fn ints(s: &str) -> Vec<i64> {
    s.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect()
}

struct Node { key: i64, height: i64, left: Tree, right: Tree }
type Tree = Option<Box<Node>>;

fn height(t: &Tree) -> i64 { t.as_ref().map_or(0, |n| n.height) }
fn fix(n: &mut Node) { n.height = 1 + height(&n.left).max(height(&n.right)); }

fn rotate_right(mut y: Box<Node>) -> Box<Node> {
    let mut x = y.left.take().unwrap();
    y.left = x.right.take();
    fix(&mut y);
    x.right = Some(y);
    fix(&mut x);
    x
}

fn rotate_left(mut y: Box<Node>) -> Box<Node> {
    let mut x = y.right.take().unwrap();
    y.right = x.left.take();
    fix(&mut y);
    x.left = Some(y);
    fix(&mut x);
    x
}

fn insert(t: Tree, key: i64) -> Box<Node> { // @0
    let mut node = match t {
        None => return Box::new(Node { key, height: 1, left: None, right: None }), // @1
        Some(node) => node,
    };
    if key < node.key { node.left = Some(insert(node.left.take(), key)); } // @2
    else if key > node.key { node.right = Some(insert(node.right.take(), key)); } // @3
    else { return node; } // @4
    fix(&mut node);
    let b = height(&node.left) - height(&node.right); // @5
    let left_key = node.left.as_ref().map_or(0, |n| n.key);
    let right_key = node.right.as_ref().map_or(0, |n| n.key);
    if b > 1 && key < left_key { return rotate_right(node); } // @6
    if b < -1 && key > right_key { return rotate_left(node); } // @7
    if b > 1 { node.left = Some(rotate_left(node.left.take().unwrap())); return rotate_right(node); } // @8
    if b < -1 { node.right = Some(rotate_right(node.right.take().unwrap())); return rotate_left(node); } // @9
    node // @10
}

fn preorder(t: &Tree, out: &mut Vec<String>) {
    if let Some(n) = t {
        out.push(n.key.to_string());
        preorder(&n.left, out);
        preorder(&n.right, out);
    }
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let keys = read_keyed(&text);
    let mut root: Tree = None;
    for key in ints(keys.get("values").map(String::as_str).unwrap_or(&text)) {
        root = Some(insert(root.take(), key));
    }
    let mut out = Vec::new();
    preorder(&root, &mut out);
    println!("{}", out.join(" "));
}
`,

  'binary-heap': `use std::collections::HashMap;
use std::io::Read;

// "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
fn read_keyed(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            if !head.trim().is_empty() { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); }
        }
    }
    keys
}

// Integers separated by spaces or commas.
fn ints(s: &str) -> Vec<i64> {
    s.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect()
}

// The heap is a[0..n]; elements past n are already extracted.
struct Heap { a: Vec<i64>, n: usize }

impl Heap {
    fn insert(&mut self, x: i64) { // @0
        self.a.push(x); let mut i = self.n; self.n += 1; // @1
        while i > 0 && self.a[(i - 1) / 2] > self.a[i] { // @2
            self.a.swap(i, (i - 1) / 2); i = (i - 1) / 2; // @3
        }
    }

    fn extract_min(&mut self) -> i64 { // @4
        let min = self.a[0]; self.a.swap(0, self.n - 1); self.n -= 1; // @5
        let mut i = 0;
        while 2 * i + 1 < self.n { // @6
            let mut c = 2 * i + 1;
            if c + 1 < self.n && self.a[c + 1] < self.a[c] { c += 1; }
            if self.a[c] >= self.a[i] { break; }
            self.a.swap(i, c); i = c; // @7
        }
        min // @8
    }
}

fn join(values: &[i64]) -> String {
    values.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" ")
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let keys = read_keyed(&text);
    let values = ints(keys.get("values").map(String::as_str).unwrap_or(&text));
    let extract: usize = keys.get("extract").and_then(|e| e.parse().ok()).unwrap_or(1);
    let mut heap = Heap { a: Vec::new(), n: 0 };
    for x in values { heap.insert(x); }
    println!("{}", join(&heap.a));
    let out: Vec<i64> = (0..extract).map(|_| heap.extract_min()).collect();
    println!("{}", join(&out));
}
`,

  'trie': `use std::collections::HashMap;
use std::io::Read;

// "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
fn read_keyed(text: &str) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if let Some((head, tail)) = line.split_once(':') {
            if !head.trim().is_empty() { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); }
        }
    }
    keys
}

#[derive(Default)]
struct Node { child: [Option<Box<Node>>; 26], end: bool }

fn insert(root: &mut Node, word: &str) { // @0
    let mut node = root; // @1
    for ch in word.bytes() { // @2
        let k = (ch - b'a') as usize;
        if node.child[k].is_none() { node.child[k] = Some(Box::default()); } // @3
        node = node.child[k].as_mut().unwrap(); // @4
    }
    node.end = true; // @5
}

// Every word below node, children visited a to z.
fn collect(node: &Node, prefix: &mut String, found: &mut Vec<String>) {
    if node.end { found.push(prefix.clone()); }
    for k in 0..26 {
        if let Some(next) = &node.child[k] {
            prefix.push((b'a' + k as u8) as char);
            collect(next, prefix, found);
            prefix.pop();
        }
    }
}

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).ok();
    let keys = read_keyed(&text);
    let mut root = Node::default();
    for word in keys.get("words").map(String::as_str).unwrap_or("").replace(',', " ").split_whitespace() {
        insert(&mut root, word);
    }
    let find = keys.get("find").cloned().unwrap_or_default();
    let mut node = &root;
    for ch in find.bytes() { // @7
        match &node.child[(ch - b'a') as usize] {
            Some(next) => node = next,
            None => { println!("none"); return; }
        }
    }
    let mut found = Vec::new();
    collect(node, &mut find.clone(), &mut found); // @8
    println!("{}", if found.is_empty() { "none".to_string() } else { found.join(" ") });
}
`,
};
