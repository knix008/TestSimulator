// Rust samples. Each reads stdin and prints the result.
const head = `use std::io::Read;
fn read_all() -> String { let mut s = String::new(); std::io::stdin().read_to_string(&mut s).ok(); s }
fn ints(s: &str) -> Vec<i64> { s.replace(',', " ").split_whitespace().filter_map(|x| x.parse().ok()).collect() }
`;

function keyed(body) {
  return `${head}
fn main() {
    let mut keys: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut rest: Vec<String> = Vec::new();
    for raw in read_all().lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() { continue; }
        if let Some((head, tail)) = line.split_once(':') {
            if !head.is_empty() && head.trim().chars().all(|c| c.is_ascii_alphabetic() || c == '_') { keys.insert(head.trim().to_lowercase(), tail.trim().to_string()); continue; }
        }
        rest.push(line.to_string());
    }
${body}
}
`;
}

function graph(body, directed = false) {
  return keyed(`    let mut names: Vec<String> = Vec::new();
    let mut edges: Vec<(usize, usize, i64)> = Vec::new();
    let mut index = |name: &str, names: &mut Vec<String>| { if let Some(i) = names.iter().position(|n| n == name) { i } else { names.push(name.to_string()); names.len() - 1 } };
    for line in &rest { let p: Vec<&str> = line.split_whitespace().collect(); if p.len() == 1 { index(p[0], &mut names); continue; } let w = if p.len() > 2 { p[2].parse().unwrap_or(1) } else { 1 }; let u = index(p[0], &mut names); let v = index(p[1], &mut names); edges.push((u, v, w)); }
    let mut adj: Vec<Vec<(usize, i64)>> = vec![Vec::new(); names.len()];
    for &(u, v, w) in &edges { adj[u].push((v, w)); ${directed ? '' : 'adj[v].push((u, w));'} }
${body}`);
}

const show = `for (i, v) in a.iter().enumerate() { if i > 0 { print!(" "); } print!("{v}"); } println!();`;

export const rust = {
  'bubble-sort': `${head}fn main() {
    let mut a = ints(&read_all());
    for i in 0..a.len().saturating_sub(1) { // @1
        let mut swapped = false; // @2
        for j in 0..a.len() - 1 - i { // @3
            if a[j] > a[j + 1] { // @4
                a.swap(j, j + 1); // @5
                swapped = true; // @6
            }
        }
        if !swapped { break; } // @7
    }
    ${show}
}
`,
  'selection-sort': `${head}fn main() { let mut a = ints(&read_all()); for i in 0..a.len().saturating_sub(1) { let mut m = i; for j in i + 1..a.len() { if a[j] < a[m] { m = j; } } a.swap(i, m); } ${show} }\n`,
  'insertion-sort': `${head}fn main() { let mut a = ints(&read_all()); for i in 1..a.len() { let key = a[i]; let mut j = i as i64 - 1; while j >= 0 && a[j as usize] > key { a[(j as usize) + 1] = a[j as usize]; j -= 1; } a[(j + 1) as usize] = key; } ${show} }\n`,
  'shell-sort': `${head}fn main() { let mut a = ints(&read_all()); let mut gap = a.len() / 2; while gap > 0 { for i in gap..a.len() { let temp = a[i]; let mut j = i; while j >= gap && a[j - gap] > temp { a[j] = a[j - gap]; j -= gap; } a[j] = temp; } gap /= 2; } ${show} }\n`,
  'merge-sort': `${head}fn main() { let mut a = ints(&read_all()); fn merge(a: &mut [i64], lo: usize, hi: usize) { if lo >= hi { return; } let mid = (lo + hi) / 2; merge(a, lo, mid); merge(a, mid + 1, hi); let mut m = Vec::new(); let (mut i, mut j) = (lo, mid + 1); while i <= mid && j <= hi { if a[i] <= a[j] { m.push(a[i]); i += 1; } else { m.push(a[j]); j += 1; } } while i <= mid { m.push(a[i]); i += 1; } while j <= hi { m.push(a[j]); j += 1; } a[lo..=hi].copy_from_slice(&m); } if !a.is_empty() { let n = a.len(); merge(&mut a, 0, n - 1); } ${show} }\n`,
  'quick-sort': `${head}fn main() { let mut a = ints(&read_all()); fn sort(a: &mut [i64], lo: usize, hi: usize) { if lo >= hi { return; } let pivot = a[hi]; let mut i = lo; for j in lo..hi { if a[j] < pivot { a.swap(i, j); i += 1; } } a.swap(i, hi); if i > 0 { sort(a, lo, i - 1); } sort(a, i + 1, hi); } if !a.is_empty() { let n = a.len(); sort(&mut a, 0, n - 1); } ${show} }\n`,
  'heap-sort': `${head}fn main() { let mut a = ints(&read_all()); fn sift(a: &mut [i64], mut i: usize, size: usize) { loop { let (l, r) = (2 * i + 1, 2 * i + 2); let mut largest = i; if l < size && a[l] > a[largest] { largest = l; } if r < size && a[r] > a[largest] { largest = r; } if largest == i { return; } a.swap(i, largest); i = largest; } } let n = a.len(); for i in (0..n / 2).rev() { sift(&mut a, i, n); } for end in (1..n).rev() { a.swap(0, end); sift(&mut a, 0, end); } ${show} }\n`,
  'radix-sort': `${head}fn main() { let mut a = ints(&read_all()); let top = *a.iter().max().unwrap_or(&0); let mut exp = 1; while top / exp > 0 { let mut buckets: Vec<Vec<i64>> = vec![Vec::new(); 10]; for &v in &a { buckets[((v / exp) % 10) as usize].push(v); } a.clear(); for b in buckets { a.extend(b); } exp *= 10; } ${show} }\n`,
  'linear-search': `${head}fn main() { let text = read_all(); let mut lines = text.lines(); let a = ints(lines.next().unwrap_or("")); let target: i64 = lines.next().unwrap_or("target: 0").split(':').nth(1).unwrap_or("0").trim().parse().unwrap_or(0); println!("{}", a.iter().position(|&v| v == target).map(|i| i as i64).unwrap_or(-1)); }\n`,
  'binary-search': `${head}fn main() { let text = read_all(); let mut lines = text.lines(); let mut a = ints(lines.next().unwrap_or("")); a.sort(); let target: i64 = lines.next().unwrap_or("target: 0").split(':').nth(1).unwrap_or("0").trim().parse().unwrap_or(0); let (mut lo, mut hi, mut found) = (0isize, a.len() as isize - 1, -1isize); while lo <= hi { let mid = (lo + hi) / 2; if a[mid as usize] == target { found = mid; break; } if a[mid as usize] < target { lo = mid + 1; } else { hi = mid - 1; } } println!("{found}"); }\n`,
  bfs: graph(`    let start = names.iter().position(|n| Some(n) == keys.get("start")).unwrap_or(0);
    let mut seen = vec![false; names.len()]; let mut q = std::collections::VecDeque::from([start]); seen[start] = true; let mut order = Vec::new();
    while let Some(u) = q.pop_front() { order.push(names[u].clone()); for &(v, _) in &adj[u] { if !seen[v] { seen[v] = true; q.push_back(v); } } }
    println!("{}", order.join(" "));`),
  dfs: graph(`    let start = names.iter().position(|n| Some(n) == keys.get("start")).unwrap_or(0);
    fn visit(u: usize, adj: &[Vec<(usize, i64)>], names: &[String], seen: &mut [bool], order: &mut Vec<String>) { seen[u] = true; order.push(names[u].clone()); for &(v, _) in &adj[u] { if !seen[v] { visit(v, adj, names, seen, order); } } }
    let mut seen = vec![false; names.len()]; let mut order = Vec::new(); visit(start, &adj, &names, &mut seen, &mut order); println!("{}", order.join(" "));`),
  dijkstra: graph(`    let start = names.iter().position(|n| Some(n) == keys.get("start")).unwrap_or(0); let inf = i64::MAX / 4;
    let mut dist = vec![inf; names.len()]; dist[start] = 0; let mut used = vec![false; names.len()];
    for _ in 0..names.len() { let mut u = None; for i in 0..names.len() { if !used[i] && u.map_or(true, |j| dist[i] < dist[j]) { u = Some(i); } } let Some(u) = u else { break }; if dist[u] == inf { break } used[u] = true; for &(v, w) in &adj[u] { if !used[v] && dist[u] + w < dist[v] { dist[v] = dist[u] + w; } } }
    for (i, n) in names.iter().enumerate() { if i > 0 { print!(" "); } print!("{n}={}", if dist[i] == inf { "INF".into() } else { dist[i].to_string() }); } println!();`),
  'bellman-ford': graph(`    let start = names.iter().position(|n| Some(n) == keys.get("start")).unwrap_or(0); let inf = i64::MAX / 4;
    let mut dist = vec![inf; names.len()]; dist[start] = 0;
    for _ in 1..names.len() { let mut changed = false; for &(u, v, w) in &edges { if dist[u] != inf && dist[u] + w < dist[v] { dist[v] = dist[u] + w; changed = true; } } if !changed { break; } }
    if edges.iter().any(|&(u, v, w)| dist[u] != inf && dist[u] + w < dist[v]) { println!("negative cycle"); } else { for (i, n) in names.iter().enumerate() { if i > 0 { print!(" "); } print!("{n}={}", if dist[i] == inf { "INF".into() } else { dist[i].to_string() }); } println!(); }`, true),
  'floyd-warshall': graph(`    let n = names.len(); let inf = i64::MAX / 4; let mut d = vec![vec![inf; n]; n];
    for i in 0..n { d[i][i] = 0; } for &(u, v, w) in &edges { d[u][v] = d[u][v].min(w); }
    for k in 0..n { for i in 0..n { for j in 0..n { if d[i][k] + d[k][j] < d[i][j] { d[i][j] = d[i][k] + d[k][j]; } } } }
    for i in 0..n { for j in 0..n { if j > 0 { print!(" "); } print!("{}", if d[i][j] > inf / 2 { "INF".into() } else { d[i][j].to_string() }); } println!(); }`, true),
  prim: graph(`    let start = names.iter().position(|n| Some(n) == keys.get("start")).unwrap_or(0); let inf = i64::MAX / 4;
    let mut key = vec![inf; names.len()]; key[start] = 0; let mut used = vec![false; names.len()]; let mut total = 0;
    for _ in 0..names.len() { let mut u = None; for i in 0..names.len() { if !used[i] && u.map_or(true, |j| key[i] < key[j]) { u = Some(i); } } let Some(u) = u else { break }; if key[u] == inf { break } used[u] = true; total += key[u]; for &(v, w) in &adj[u] { if !used[v] && w < key[v] { key[v] = w; } } }
    println!("{total}");`),
  kruskal: graph(`    let mut parent: Vec<usize> = (0..names.len()).collect();
    fn find(parent: &mut [usize], mut x: usize) -> usize { while parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x]; } x }
    let mut order = edges.clone(); order.sort_by_key(|&(_, _, w)| w); let mut total = 0i64;
    for (u, v, w) in order { let (ru, rv) = (find(&mut parent, u), find(&mut parent, v)); if ru != rv { parent[ru] = rv; total += w; } }
    println!("{total}");`),
  'topological-sort': graph(`    let mut indeg = vec![0; names.len()]; for &(_, v, _) in &edges { indeg[v] += 1; }
    let mut q: std::collections::VecDeque<usize> = (0..names.len()).filter(|&i| indeg[i] == 0).collect(); let mut order = Vec::new();
    while let Some(u) = q.pop_front() { order.push(names[u].clone()); for &(v, _) in &adj[u] { indeg[v] -= 1; if indeg[v] == 0 { q.push_back(v); } } }
    println!("{}", if order.len() == names.len() { order.join(" ") } else { "cycle".into() });`, true),
  astar: `${head}fn main() { let rows: Vec<String> = read_all().lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect(); let cols = rows[0].len();
    let (mut start, mut goal) = (0usize, 0usize); let mut walls = std::collections::HashSet::new();
    for (r, row) in rows.iter().enumerate() { for (c, ch) in row.chars().enumerate() { let i = r * cols + c; match ch { 'S' | 's' => start = i, 'G' | 'g' => goal = i, '#' => { walls.insert(i); }, _ => {} } } }
    let h = |i: usize| -> i64 { let (dr, dc) = ((i / cols) as isize - (goal / cols) as isize, (i % cols) as isize - (goal % cols) as isize); (dr.abs() + dc.abs()) as i64 };
    let mut g = vec![i64::MAX / 4; rows.len() * cols]; g[start] = 0; let mut open = vec![start]; let mut closed = std::collections::HashSet::new(); let mut answer = "none".to_string();
    while !open.is_empty() { let mut best = 0; for k in 1..open.len() { let (x, y) = (open[k], open[best]); if g[x] + h(x) < g[y] + h(y) || (g[x] + h(x) == g[y] + h(y) && h(x) < h(y)) { best = k; } }
        let u = open.remove(best); if u == goal { answer = g[u].to_string(); break; } closed.insert(u); let (r, c) = (u / cols, u % cols);
        for (dr, dc) in [(-1isize, 0isize), (0, 1), (1, 0), (0, -1)] { let (vr, vc) = (r as isize + dr, c as isize + dc); if vr < 0 || vc < 0 || vr >= rows.len() as isize || vc >= cols as isize { continue; } let v = vr as usize * cols + vc as usize; if walls.contains(&v) || closed.contains(&v) { continue; } if g[u] + 1 < g[v] { g[v] = g[u] + 1; if !open.contains(&v) { open.push(v); } } } }
    println!("{answer}"); }\n`,
  fibonacci: `${head}fn main() { let n: usize = read_all().split(':').nth(1).unwrap_or("0").trim().parse().unwrap_or(0); let mut f = vec![0u128, 1]; for i in 2..=n { f.push(f[i - 1] + f[i - 2]); } println!("{}", f[n]); }\n`,
  knapsack: keyed(`    let w = ints(keys.get("weights").map(String::as_str).unwrap_or("")); let v = ints(keys.get("values").map(String::as_str).unwrap_or("")); let cap: usize = keys.get("capacity").and_then(|s| s.parse().ok()).unwrap_or(0);
    let mut k = vec![vec![0i64; cap + 1]; w.len() + 1];
    for i in 1..=w.len() { for c in 0..=cap { k[i][c] = k[i - 1][c]; if w[i - 1] as usize <= c { k[i][c] = k[i][c].max(k[i - 1][c - w[i - 1] as usize] + v[i - 1]); } } }
    println!("{}", k[w.len()][cap]);`),
  lcs: keyed(`    let (x, y) = (keys.get("a").cloned().unwrap_or_default(), keys.get("b").cloned().unwrap_or_default()); let (xb, yb) = (x.as_bytes(), y.as_bytes());
    let mut c = vec![vec![0i64; y.len() + 1]; x.len() + 1];
    for i in 1..=x.len() { for j in 1..=y.len() { c[i][j] = if xb[i - 1] == yb[j - 1] { c[i - 1][j - 1] + 1 } else { c[i - 1][j].max(c[i][j - 1]) }; } }
    let (mut i, mut j, mut s) = (x.len(), y.len(), String::new());
    while i > 0 && j > 0 { if xb[i - 1] == yb[j - 1] { s.insert(0, xb[i - 1] as char); i -= 1; j -= 1; } else if c[i - 1][j] >= c[i][j - 1] { i -= 1; } else { j -= 1; } }
    println!("{s}");`),
  'edit-distance': keyed(`    let (a, b) = (keys.get("a").cloned().unwrap_or_default(), keys.get("b").cloned().unwrap_or_default()); let (ab, bb) = (a.as_bytes(), b.as_bytes());
    let mut d = vec![vec![0i64; b.len() + 1]; a.len() + 1]; for i in 0..=a.len() { d[i][0] = i as i64; } for j in 0..=b.len() { d[0][j] = j as i64; }
    for i in 1..=a.len() { for j in 1..=b.len() { d[i][j] = if ab[i - 1] == bb[j - 1] { d[i - 1][j - 1] } else { 1 + d[i - 1][j].min(d[i][j - 1]).min(d[i - 1][j - 1]) }; } }
    println!("{}", d[a.len()][b.len()]);`),
  kmp: keyed(`    let (t, p) = (keys.get("text").cloned().unwrap_or_default(), keys.get("pattern").cloned().unwrap_or_default()); let (tb, pb) = (t.as_bytes(), p.as_bytes());
    let mut lps = vec![0; p.len()]; let (mut length, mut k) = (0, 1);
    while k < p.len() { if pb[k] == pb[length] { length += 1; lps[k] = length; k += 1; } else if length > 0 { length = lps[length - 1]; } else { lps[k] = 0; k += 1; } }
    let mut found = Vec::new(); let (mut i, mut j) = (0, 0);
    while i < t.len() { if tb[i] == pb[j] { i += 1; j += 1; if j == p.len() { found.push(i - p.len()); j = lps[j - 1]; } } else if j > 0 { j = lps[j - 1]; } else { i += 1; } }
    println!("{}", if found.is_empty() { "none".into() } else { found.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" ") });`),
  'rabin-karp': keyed(`    let (t, p) = (keys.get("text").cloned().unwrap_or_default(), keys.get("pattern").cloned().unwrap_or_default()); let (d, q) = (256i64, 101i64);
    let mut h = 1i64; for _ in 0..p.len().saturating_sub(1) { h = h * d % q; } let (mut ph, mut th) = (0i64, 0i64);
    for k in 0..p.len() { ph = (d * ph + p.as_bytes()[k] as i64) % q; th = (d * th + t.as_bytes()[k] as i64) % q; }
    let mut found = Vec::new();
    for s in 0..=t.len() - p.len() { if ph == th && &t[s..s + p.len()] == p { found.push(s); } if s < t.len() - p.len() { th = (d * (th - t.as_bytes()[s] as i64 * h) + t.as_bytes()[s + p.len()] as i64) % q; if th < 0 { th += q; } } }
    println!("{}", if found.is_empty() { "none".into() } else { found.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" ") });`),
  bst: keyed(`    let values = ints(&rest.join(" ")); let target: i64 = keys.get("search").and_then(|s| s.parse().ok()).unwrap_or(0);
    let mut nodes: Vec<(i64, i64, i64)> = Vec::new(); let mut root = -1i64;
    for key in values { if root < 0 { nodes.push((key, -1, -1)); root = 0; continue; } let mut cur = root; loop { if key == nodes[cur as usize].0 { break; } let left = key < nodes[cur as usize].0; let next = if left { nodes[cur as usize].1 } else { nodes[cur as usize].2 }; if next < 0 { nodes.push((key, -1, -1)); let slot = (nodes.len() - 1) as i64; if left { nodes[cur as usize].1 = slot; } else { nodes[cur as usize].2 = slot; } break; } cur = next; } }
    let mut cur = root; let mut answer = "not found"; while cur >= 0 { if target == nodes[cur as usize].0 { answer = "found"; break; } cur = if target < nodes[cur as usize].0 { nodes[cur as usize].1 } else { nodes[cur as usize].2 }; } println!("{answer}");`),
  'tree-traversal': keyed(`    let values = ints(&rest.join(" ")); let mut nodes: Vec<(i64, i64, i64)> = Vec::new(); let mut root = -1i64;
    for key in values { if root < 0 { nodes.push((key, -1, -1)); root = 0; continue; } let mut cur = root; loop { if key == nodes[cur as usize].0 { break; } let left = key < nodes[cur as usize].0; let next = if left { nodes[cur as usize].1 } else { nodes[cur as usize].2 }; if next < 0 { nodes.push((key, -1, -1)); let slot = (nodes.len() - 1) as i64; if left { nodes[cur as usize].1 = slot; } else { nodes[cur as usize].2 = slot; } break; } cur = next; } }
    fn walk(cur: i64, order: i32, nodes: &[(i64, i64, i64)], out: &mut Vec<i64>) { if cur < 0 { return; } let n = nodes[cur as usize]; if order == 0 { out.push(n.0); } walk(n.1, order, nodes, out); if order == 1 { out.push(n.0); } walk(n.2, order, nodes, out); if order == 2 { out.push(n.0); } }
    let show = |o: &[i64]| { for (i, v) in o.iter().enumerate() { if i > 0 { print!(" "); } print!("{v}"); } println!(); };
    for order in 0..3 { let mut out = Vec::new(); walk(root, order, &nodes, &mut out); show(&out); }
    let mut q = std::collections::VecDeque::from([root]); let mut level = Vec::new(); while let Some(cur) = q.pop_front() { let n = nodes[cur as usize]; level.push(n.0); if n.1 >= 0 { q.push_back(n.1); } if n.2 >= 0 { q.push_back(n.2); } } show(&level);`),
  'n-queens': keyed(`    let n: usize = keys.get("n").and_then(|s| s.parse().ok()).unwrap_or(8); let mode = keys.get("mode").map(|s| s.to_lowercase()).unwrap_or_else(|| "first".into());
    let mut queens = vec![-1isize; n]; let mut solutions: Vec<Vec<isize>> = Vec::new();
    fn safe(queens: &[isize], row: usize, col: isize) -> bool { (0..row).all(|r| queens[r] != col && (queens[r] - col).abs() != (row - r) as isize) }
    fn solve(row: usize, n: usize, mode: &str, queens: &mut [isize], solutions: &mut Vec<Vec<isize>>) -> bool { if row == n { solutions.push(queens.to_vec()); return mode != "first"; } for col in 0..n as isize { if safe(queens, row, col) { queens[row] = col; if !solve(row + 1, n, mode, queens, solutions) { return false; } } } true }
    solve(0, n, &mode, &mut queens, &mut solutions);
    if mode == "all" { println!("{}", solutions.len()); } else if solutions.is_empty() { println!("none"); } else { println!("{}", solutions[0].iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" ")); }`),
  gcd: keyed(`    let (mut a, mut b): (i64, i64) = (keys["a"].parse().unwrap_or(0), keys["b"].parse().unwrap_or(0)); while b != 0 { let r = a % b; a = b; b = r; } println!("{a}");`),
  sieve: keyed(`    let n: usize = keys["n"].parse().unwrap_or(2); let mut prime = vec![true; n + 1]; prime[0] = false; if n > 0 { prime[1] = false; }
    let mut p = 2; while p * p <= n { if prime[p] { let mut m = p * p; while m <= n { prime[m] = false; m += p; } } p += 1; }
    let out: Vec<String> = (2..=n).filter(|&i| prime[i]).map(|i| i.to_string()).collect(); println!("{}", out.join(" "));`),
  hanoi: keyed(`    let n: u32 = keys["n"].parse().unwrap_or(1); println!("{}", (1i64 << n) - 1);`),
};
