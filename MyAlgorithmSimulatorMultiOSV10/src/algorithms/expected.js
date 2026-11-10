// The one-line (or few-line) result a sample program must print for the same input.
// The desktop and web runners show this text; `npm run test:samples` compares it.

const joined = (values) => values.join(' ');
const distLine = (view) => view.graph.nodes.map((node) => `${node.label}=${view.note[node.id] === '∞' ? 'INF' : view.note[node.id]}`).join(' ');

/** @returns {string} stdout without a trailing newline */
export function expectedOutput(algorithm, input, frames) {
  const last = frames[frames.length - 1];
  const { view, vars } = last;
  switch (algorithm.id) {
    case 'bubble-sort': case 'selection-sort': case 'insertion-sort': case 'shell-sort':
    case 'merge-sort': case 'quick-sort': case 'heap-sort': case 'radix-sort':
    case 'cocktail-sort': case 'comb-sort': case 'gnome-sort': case 'odd-even-sort':
    case 'counting-sort': case 'pancake-sort': case 'dutch-flag':
      return joined(view.values);
    case 'linear-search': case 'binary-search':
    case 'jump-search': case 'interpolation-search': case 'exponential-search':
    case 'quickselect': case 'kadane': case 'coin-change': case 'lis':
    case 'activity-selection': case 'factorial': case 'fast-power':
      return String(vars.result);
    case 'bfs': case 'dfs':
      return String(view.result).split(' → ').join(' ');
    case 'dijkstra': case 'bellman-ford':
      return view.result?.en === 'Negative cycle' ? 'negative cycle' : distLine(view);
    case 'floyd-warshall':
      return view.cells.map((row) => row.map((cell) => (cell === '∞' ? 'INF' : cell)).join(' ')).join('\n');
    case 'prim': case 'kruskal':
      return String(view.result);
    case 'fibonacci': case 'knapsack': case 'edit-distance': case 'gcd':
      return String(vars.result);
    case 'topological-sort':
      return view.result?.en === 'Cycle' ? 'cycle' : String(view.result).split(' → ').join(' ');
    case 'astar': case 'grid-bfs': case 'greedy-best-first': case 'maze-dfs':
      return vars.length === undefined ? 'none' : String(vars.length);
    case 'lcs':
      return vars.result;
    case 'kmp': case 'rabin-karp': case 'naive-search':
      return view.found.length ? view.found.join(' ') : 'none';
    case 'bst':
      return vars.result;
    case 'tree-traversal':
      return view.lists.map((list) => list.items.join(' ')).join('\n');
    case 'n-queens':
      return input.mode === 'all' ? String(vars.solutions) : view.queens.join(' ');
    case 'sieve':
      return String(vars.result).split(',').join(' ');
    case 'hanoi':
      return String(vars.moves);
    case 'subset-sum': case 'sudoku': case 'fractional-knapsack': case 'job-sequencing':
    case 'avl-tree': case 'trie': case 'huffman':
      return String(vars.result);
    case 'permutations':
      return view.output;
    case 'binary-heap':
      return vars.output;
    default:
      throw new Error(`no expected output for ${algorithm.id}`);
  }
}
