// java samples for the classroom algorithms (src/algorithms/classroom.js).
// Each program reads the input box on stdin and prints exactly expectedOutput().
export const java = {
  'grid-bfs': `import java.util.*;

public class Main {
    static int rows, cols, start = -1, goal = -1;
    static boolean[] wall;

    // Read the grid: S = start, G = goal, # = wall, . = open.
    static void readGrid() throws Exception {
        List<String> lines = new ArrayList<>();
        for (String raw : new String(System.in.readAllBytes()).split("\\\\R")) {
            String line = raw.trim();
            if (!line.isEmpty()) lines.add(line);
        }
        rows = lines.size();
        cols = lines.get(0).length();
        wall = new boolean[rows * cols];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                char ch = lines.get(r).charAt(c);
                int i = r * cols + c;
                if (ch == 'S' || ch == 's') start = i;
                else if (ch == 'G' || ch == 'g') goal = i;
                else if (ch == '#') wall[i] = true;
            }
        }
    }

    // Neighbours of cell u in the order up, right, down, left.
    static List<Integer> neighbours(int u) {
        int r = u / cols, c = u % cols;
        int[] dr = { -1, 0, 1, 0 }, dc = { 0, 1, 0, -1 };
        List<Integer> out = new ArrayList<>();
        for (int k = 0; k < 4; k++) {
            int vr = r + dr[k], vc = c + dc[k];
            if (vr >= 0 && vc >= 0 && vr < rows && vc < cols) out.add(vr * cols + vc);
        }
        return out;
    }

    public static void main(String[] args) throws Exception {
        readGrid();
        int[] dist = new int[rows * cols];
        Arrays.fill(dist, -1);
        ArrayDeque<Integer> queue = new ArrayDeque<>();
        dist[start] = 0; queue.add(start); // @1
        while (!queue.isEmpty()) { // @2
            int u = queue.poll(); // @3
            if (u == goal) { System.out.println(dist[u]); return; } // @4
            for (int v : neighbours(u)) { // @5
                if (!wall[v] && dist[v] < 0) { // @6
                    dist[v] = dist[u] + 1; queue.add(v); // @7
                }
            }
        }
        System.out.println("none"); // @8
    }
}
`,

  'greedy-best-first': `import java.util.*;

public class Main {
    static int rows, cols, start = -1, goal = -1;
    static boolean[] wall;

    // Read the grid: S = start, G = goal, # = wall, . = open.
    static void readGrid() throws Exception {
        List<String> lines = new ArrayList<>();
        for (String raw : new String(System.in.readAllBytes()).split("\\\\R")) {
            String line = raw.trim();
            if (!line.isEmpty()) lines.add(line);
        }
        rows = lines.size();
        cols = lines.get(0).length();
        wall = new boolean[rows * cols];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                char ch = lines.get(r).charAt(c);
                int i = r * cols + c;
                if (ch == 'S' || ch == 's') start = i;
                else if (ch == 'G' || ch == 'g') goal = i;
                else if (ch == '#') wall[i] = true;
            }
        }
    }

    // Neighbours of cell u in the order up, right, down, left.
    static List<Integer> neighbours(int u) {
        int r = u / cols, c = u % cols;
        int[] dr = { -1, 0, 1, 0 }, dc = { 0, 1, 0, -1 };
        List<Integer> out = new ArrayList<>();
        for (int k = 0; k < 4; k++) {
            int vr = r + dr[k], vc = c + dc[k];
            if (vr >= 0 && vc >= 0 && vr < rows && vc < cols) out.add(vr * cols + vc);
        }
        return out;
    }

    // Manhattan distance from cell i to the goal.
    static int h(int i) {
        return Math.abs(i / cols - goal / cols) + Math.abs(i % cols - goal % cols);
    }

    public static void main(String[] args) throws Exception {
        readGrid();
        int[] parent = new int[rows * cols];
        Arrays.fill(parent, -1);
        boolean[] seen = new boolean[rows * cols];
        List<Integer> open = new ArrayList<>();
        open.add(start); seen[start] = true; // @1
        while (!open.isEmpty()) { // @2
            int best = 0;
            for (int k = 1; k < open.size(); k++) {
                if (h(open.get(k)) < h(open.get(best))) best = k; // @3
            }
            int u = open.get(best);
            if (u == goal) { // @4
                int length = 0;
                for (int x = goal; x != start; x = parent[x]) length++;
                System.out.println(length);
                return;
            }
            open.remove(best); // @5
            for (int v : neighbours(u)) { // @6
                if (!wall[v] && !seen[v]) { seen[v] = true; parent[v] = u; open.add(v); } // @7
            }
        }
        System.out.println("none"); // @8
    }
}
`,

  'maze-dfs': `import java.util.*;

public class Main {
    static int rows, cols, start = -1, goal = -1;
    static boolean[] wall, visited;
    static int[] parent;

    // Read the grid: S = start, G = goal, # = wall, . = open.
    static void readGrid() throws Exception {
        List<String> lines = new ArrayList<>();
        for (String raw : new String(System.in.readAllBytes()).split("\\\\R")) {
            String line = raw.trim();
            if (!line.isEmpty()) lines.add(line);
        }
        rows = lines.size();
        cols = lines.get(0).length();
        wall = new boolean[rows * cols];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                char ch = lines.get(r).charAt(c);
                int i = r * cols + c;
                if (ch == 'S' || ch == 's') start = i;
                else if (ch == 'G' || ch == 'g') goal = i;
                else if (ch == '#') wall[i] = true;
            }
        }
    }

    // Neighbours of cell u in the order up, right, down, left.
    static List<Integer> neighbours(int u) {
        int r = u / cols, c = u % cols;
        int[] dr = { -1, 0, 1, 0 }, dc = { 0, 1, 0, -1 };
        List<Integer> out = new ArrayList<>();
        for (int k = 0; k < 4; k++) {
            int vr = r + dr[k], vc = c + dc[k];
            if (vr >= 0 && vc >= 0 && vr < rows && vc < cols) out.add(vr * cols + vc);
        }
        return out;
    }

    static boolean dfs(int u) { // @0
        if (u == goal) return true; // @1
        visited[u] = true; // @2
        for (int v : neighbours(u)) { // @3
            if (!wall[v] && !visited[v]) { // @4
                parent[v] = u; // @5
                if (dfs(v)) return true; // @6
            }
        }
        return false; // @7
    }

    public static void main(String[] args) throws Exception {
        readGrid();
        visited = new boolean[rows * cols];
        parent = new int[rows * cols];
        Arrays.fill(parent, -1);
        if (dfs(start)) {
            int length = 0;
            for (int x = goal; x != start; x = parent[x]) length++;
            System.out.println(length);
        } else {
            System.out.println("none");
        }
    }
}
`,

  'subset-sum': `import java.util.*;

public class Main {
    // "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
    static Map<String, String> readKeyed(String text) {
        Map<String, String> keys = new HashMap<>();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':');
            if (c > 0) keys.put(line.substring(0, c).trim().toLowerCase(), line.substring(c + 1).trim());
        }
        return keys;
    }

    // Integers separated by spaces or commas.
    static int[] ints(String s) {
        String t = s.replace(',', ' ').trim();
        if (t.isEmpty()) return new int[0];
        return Arrays.stream(t.split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
    }

    static int[] a;
    static int target;
    static boolean[] taken;

    static boolean solve(int i, int sum) { // @0
        if (sum == target) return true; // @1
        if (i == a.length) return false; // @2
        if (sum + a[i] <= target) { // @3
            taken[i] = true;
            if (solve(i + 1, sum + a[i])) return true; // @4
            taken[i] = false; // @5
        }
        return solve(i + 1, sum); // @6
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> keys = readKeyed(new String(System.in.readAllBytes()));
        a = ints(keys.get("values"));
        target = Integer.parseInt(keys.get("target"));
        taken = new boolean[a.length];
        if (solve(0, 0)) {
            StringJoiner out = new StringJoiner(" ");
            for (int i = 0; i < a.length; i++) if (taken[i]) out.add(String.valueOf(a[i]));
            System.out.println(out);
        } else {
            System.out.println("none");
        }
    }
}
`,

  'permutations': `import java.util.*;

public class Main {
    // "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
    static Map<String, String> readKeyed(String text) {
        Map<String, String> keys = new HashMap<>();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':');
            if (c > 0) keys.put(line.substring(0, c).trim().toLowerCase(), line.substring(c + 1).trim());
        }
        return keys;
    }

    // Integers separated by spaces or commas.
    static int[] ints(String s) {
        String t = s.replace(',', ' ').trim();
        if (t.isEmpty()) return new int[0];
        return Arrays.stream(t.split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
    }

    static int[] a;
    static boolean[] used;
    static List<Integer> cur = new ArrayList<>();
    static StringBuilder out = new StringBuilder();

    static void permute() { // @0
        if (cur.size() == a.length) { // @1
            StringJoiner line = new StringJoiner(" ");
            for (int v : cur) line.add(String.valueOf(v));
            out.append(line).append('\\n');
            return;
        }
        for (int i = 0; i < a.length; i++) { // @2
            if (used[i]) continue; // @3
            used[i] = true; cur.add(a[i]); // @4
            permute(); // @5
            cur.remove(cur.size() - 1); used[i] = false; // @6
        }
    }

    public static void main(String[] args) throws Exception {
        String text = new String(System.in.readAllBytes());
        Map<String, String> keys = readKeyed(text);
        a = ints(keys.getOrDefault("items", text));
        used = new boolean[a.length];
        permute();
        System.out.print(out);
    }
}
`,

  'sudoku': `import java.util.*;

public class Main {
    static int[] grid = new int[81];

    // Is digit d already in the row, column or 3x3 box of cell i (not counting cell i)?
    static boolean clash(int i, int d) {
        int r = i / 9, c = i % 9;
        for (int k = 0; k < 9; k++) {
            if (r * 9 + k != i && grid[r * 9 + k] == d) return true;
            if (k * 9 + c != i && grid[k * 9 + c] == d) return true;
        }
        int br = r - r % 3, bc = c - c % 3;
        for (int y = br; y < br + 3; y++)
            for (int x = bc; x < bc + 3; x++)
                if (y * 9 + x != i && grid[y * 9 + x] == d) return true;
        return false;
    }

    static boolean solve() { // @0
        int i = 0;
        while (i < 81 && grid[i] != 0) i++;
        if (i == 81) return true; // @1
        for (int d = 1; d <= 9; d++) { // @2
            if (clash(i, d)) continue; // @3
            grid[i] = d; // @4
            if (solve()) return true; // @5
            grid[i] = 0; // @6
        }
        return false; // @7
    }

    public static void main(String[] args) throws Exception {
        int n = 0;
        for (String raw : new String(System.in.readAllBytes()).split("\\\\R")) {
            String line = raw.replaceAll("[\\\\s|+\\\\-]", "");
            for (char ch : line.toCharArray()) grid[n++] = ch == '.' ? 0 : ch - '0';
        }
        boolean ok = true;
        for (int i = 0; i < 81; i++) if (grid[i] != 0 && clash(i, grid[i])) ok = false;
        if (ok && solve()) {
            for (int r = 0; r < 9; r++) {
                StringBuilder row = new StringBuilder();
                for (int c = 0; c < 9; c++) row.append(grid[r * 9 + c]);
                System.out.println(row);
            }
        } else {
            System.out.println("none");
        }
    }
}
`,

  'huffman': `import java.util.*;

public class Main {
    // "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
    static Map<String, String> readKeyed(String text) {
        Map<String, String> keys = new HashMap<>();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':');
            if (c > 0) keys.put(line.substring(0, c).trim().toLowerCase(), line.substring(c + 1).trim());
        }
        return keys;
    }

    static class Node {
        int freq;
        Node left, right;
        Node(int freq, Node left, Node right) { this.freq = freq; this.left = left; this.right = right; }
    }

    // Sum of freq x code length over the leaves below node (depth = code length).
    static int bits(Node node, int depth) {
        if (node.left == null) return node.freq * Math.max(depth, 1); // a lone symbol still needs 1 bit
        return bits(node.left, depth + 1) + bits(node.right, depth + 1);
    }

    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes());
        String text = readKeyed(input).getOrDefault("text", input.trim());
        Map<Character, Integer> freq = new TreeMap<>();
        for (char ch : text.toCharArray()) freq.merge(ch, 1, Integer::sum); // @1
        PriorityQueue<Node> queue = new PriorityQueue<>((x, y) -> x.freq - y.freq);
        for (int f : freq.values()) queue.add(new Node(f, null, null)); // @2
        while (queue.size() > 1) { // @3
            Node x = queue.poll(), y = queue.poll(); // @4
            Node z = new Node(x.freq + y.freq, x, y); // @5
            queue.add(z); // @6
        }
        System.out.println(bits(queue.poll(), 0)); // @8
    }
}
`,

  'fractional-knapsack': `import java.util.*;

public class Main {
    // "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
    static Map<String, String> readKeyed(String text) {
        Map<String, String> keys = new HashMap<>();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':');
            if (c > 0) keys.put(line.substring(0, c).trim().toLowerCase(), line.substring(c + 1).trim());
        }
        return keys;
    }

    // Integers separated by spaces or commas.
    static int[] ints(String s) {
        String t = s.replace(',', ' ').trim();
        if (t.isEmpty()) return new int[0];
        return Arrays.stream(t.split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> keys = readKeyed(new String(System.in.readAllBytes()));
        int[] w = ints(keys.get("weights")), v = ints(keys.get("values"));
        long room = Long.parseLong(keys.get("capacity"));
        Integer[] order = new Integer[w.length];
        for (int i = 0; i < w.length; i++) order[i] = i;
        // Largest value per weight first: v[b]/w[b] vs v[a]/w[a] compared by cross-multiplying.
        Arrays.sort(order, (a, b) -> v[b] * w[a] != v[a] * w[b] ? Integer.compare(v[b] * w[a], v[a] * w[b]) : a - b); // @1
        long num = 0, den = 1; // the total value is kept exactly as num / den
        for (int i : order) { // @2
            if (room == 0) break;
            if (w[i] <= room) { // @3
                room -= w[i];
                num += v[i] * den;
            } else { // @4
                num = num * w[i] + v[i] * room * den;
                den *= w[i];
                room = 0;
                break;
            }
        }
        long cents = (2 * 100 * num + den) / (2 * den); // round half up to 2 decimals
        System.out.println(cents / 100 + "." + String.format("%02d", cents % 100)); // @5
    }
}
`,

  'job-sequencing': `import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        // One job per line: "deadline profit". Jobs are J1, J2, ... in input order.
        List<int[]> jobs = new ArrayList<>();
        for (String raw : new String(System.in.readAllBytes()).split("\\\\R")) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            String[] p = line.split("[\\\\s,]+");
            jobs.add(new int[] { Integer.parseInt(p[0]), Integer.parseInt(p[1]) });
        }
        int n = jobs.size(), slots = 0;
        for (int[] job : jobs) slots = Math.max(slots, job[0]);
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> jobs.get(b)[1] != jobs.get(a)[1] ? jobs.get(b)[1] - jobs.get(a)[1] : a - b); // @1
        int[] slot = new int[slots + 1];
        Arrays.fill(slot, -1);
        int profit = 0;
        for (int j : order) { // @2
            for (int t = Math.min(jobs.get(j)[0], slots); t >= 1; t--) { // @3
                if (slot[t] < 0) { slot[t] = j; profit += jobs.get(j)[1]; break; } // @4
            }
        }
        StringJoiner sequence = new StringJoiner(" ");
        for (int t = 1; t <= slots; t++) if (slot[t] >= 0) sequence.add("J" + (slot[t] + 1));
        System.out.println(sequence); // @6
        System.out.println(profit);
    }
}
`,

  'avl-tree': `import java.util.*;

public class Main {
    // "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
    static Map<String, String> readKeyed(String text) {
        Map<String, String> keys = new HashMap<>();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':');
            if (c > 0) keys.put(line.substring(0, c).trim().toLowerCase(), line.substring(c + 1).trim());
        }
        return keys;
    }

    // Integers separated by spaces or commas.
    static int[] ints(String s) {
        String t = s.replace(',', ' ').trim();
        if (t.isEmpty()) return new int[0];
        return Arrays.stream(t.split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
    }

    static class Node {
        int key, height = 1;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    static int height(Node n) { return n == null ? 0 : n.height; }
    static void fix(Node n) { n.height = 1 + Math.max(height(n.left), height(n.right)); }

    static Node rotateRight(Node y) { Node x = y.left; y.left = x.right; x.right = y; fix(y); fix(x); return x; }
    static Node rotateLeft(Node y) { Node x = y.right; y.right = x.left; x.left = y; fix(y); fix(x); return x; }

    static Node insert(Node node, int key) { // @0
        if (node == null) return new Node(key); // @1
        if (key < node.key) node.left = insert(node.left, key); // @2
        else if (key > node.key) node.right = insert(node.right, key); // @3
        else return node; // @4
        fix(node);
        int b = height(node.left) - height(node.right); // @5
        if (b > 1 && key < node.left.key) return rotateRight(node); // @6
        if (b < -1 && key > node.right.key) return rotateLeft(node); // @7
        if (b > 1) { node.left = rotateLeft(node.left); return rotateRight(node); } // @8
        if (b < -1) { node.right = rotateRight(node.right); return rotateLeft(node); } // @9
        return node; // @10
    }

    static void preorder(Node n, StringJoiner out) {
        if (n == null) return;
        out.add(String.valueOf(n.key));
        preorder(n.left, out);
        preorder(n.right, out);
    }

    public static void main(String[] args) throws Exception {
        String text = new String(System.in.readAllBytes());
        Node root = null;
        for (int key : ints(readKeyed(text).getOrDefault("values", text))) root = insert(root, key);
        StringJoiner out = new StringJoiner(" ");
        preorder(root, out);
        System.out.println(out);
    }
}
`,

  'binary-heap': `import java.util.*;

public class Main {
    // "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
    static Map<String, String> readKeyed(String text) {
        Map<String, String> keys = new HashMap<>();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':');
            if (c > 0) keys.put(line.substring(0, c).trim().toLowerCase(), line.substring(c + 1).trim());
        }
        return keys;
    }

    // Integers separated by spaces or commas.
    static int[] ints(String s) {
        String t = s.replace(',', ' ').trim();
        if (t.isEmpty()) return new int[0];
        return Arrays.stream(t.split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
    }

    static int[] a;
    static int n = 0;

    static void swap(int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }

    static void insert(int x) { // @0
        a[n] = x; int i = n; n++; // @1
        while (i > 0 && a[(i - 1) / 2] > a[i]) { // @2
            swap(i, (i - 1) / 2); i = (i - 1) / 2; // @3
        }
    }

    static int extractMin() { // @4
        int min = a[0]; swap(0, n - 1); n--; // @5
        int i = 0;
        while (2 * i + 1 < n) { // @6
            int c = 2 * i + 1;
            if (c + 1 < n && a[c + 1] < a[c]) c = c + 1;
            if (a[c] >= a[i]) break;
            swap(i, c); i = c; // @7
        }
        return min; // @8
    }

    static String join(int[] values, int count) {
        StringJoiner out = new StringJoiner(" ");
        for (int k = 0; k < count; k++) out.add(String.valueOf(values[k]));
        return out.toString();
    }

    public static void main(String[] args) throws Exception {
        String text = new String(System.in.readAllBytes());
        Map<String, String> keys = readKeyed(text);
        int[] values = ints(keys.getOrDefault("values", text));
        int extract = Integer.parseInt(keys.getOrDefault("extract", "1"));
        a = new int[values.length];
        for (int x : values) insert(x);
        System.out.println(join(a, n));
        int[] out = new int[extract];
        for (int k = 0; k < extract; k++) out[k] = extractMin();
        System.out.println(join(out, extract));
    }
}
`,

  'trie': `import java.util.*;

public class Main {
    // "key: value" lines -> map (keys lower-case; # comments and blank lines are ignored).
    static Map<String, String> readKeyed(String text) {
        Map<String, String> keys = new HashMap<>();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            int c = line.indexOf(':');
            if (c > 0) keys.put(line.substring(0, c).trim().toLowerCase(), line.substring(c + 1).trim());
        }
        return keys;
    }

    static class Node {
        Node[] child = new Node[26];
        boolean end;
    }

    static Node root = new Node();

    static void insert(String word) { // @0
        Node node = root; // @1
        for (char ch : word.toCharArray()) { // @2
            if (node.child[ch - 'a'] == null) node.child[ch - 'a'] = new Node(); // @3
            node = node.child[ch - 'a']; // @4
        }
        node.end = true; // @5
    }

    // Every word below node, children visited a to z.
    static void collect(Node node, String prefix, List<String> found) {
        if (node.end) found.add(prefix);
        for (int k = 0; k < 26; k++)
            if (node.child[k] != null) collect(node.child[k], prefix + (char) ('a' + k), found);
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> keys = readKeyed(new String(System.in.readAllBytes()));
        for (String word : keys.getOrDefault("words", "").split("[\\\\s,]+"))
            if (!word.isEmpty()) insert(word);
        String find = keys.getOrDefault("find", "");
        Node node = root;
        for (char ch : find.toCharArray()) { // @7
            node = node.child[ch - 'a'];
            if (node == null) { System.out.println("none"); return; }
        }
        List<String> found = new ArrayList<>();
        collect(node, find, found); // @8
        System.out.println(found.isEmpty() ? "none" : String.join(" ", found));
    }
}
`,
};
