import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALGORITHMS, runAlgorithm } from '../src/algorithms/index.js';

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const primesUpTo = (n) => { const p = Array(n + 1).fill(true); p[1] = false; for (let i = 2; i * i <= n; i++) if (p[i]) for (let m = i * i; m <= n; m += i) p[m] = false; return p.flatMap((v, i) => (v && i >= 2 ? [i] : [])); };

describe('every algorithm', () => {
  for (const algo of ALGORITHMS) {
    it(`${algo.id}: default input and a random input both produce frames`, () => {
      for (const text of [algo.input.default, algo.input.random()]) {
        const input = algo.input.parse(text);
        const frames = runAlgorithm(algo.id, input);
        assert.ok(frames.length > 0, 'no frames');
        assert.ok(frames.length <= 6000, 'too many frames');
        for (const frame of frames) {
          assert.equal(typeof frame.line, 'number');
          assert.ok(frame.line >= 0 && frame.line < algo.pseudo.length, `line ${frame.line} out of range`);
          assert.equal(typeof frame.msg.ko, 'string');
          assert.equal(typeof frame.msg.en, 'string');
          assert.equal(frame.view.kind, algo.view);
          assert.equal(typeof frame.vars, 'object');
        }
      }
    });
  }
});

describe('results', () => {
  const run = (id, text) => {
    const algo = ALGORITHMS.find((a) => a.id === id);
    return runAlgorithm(id, algo.input.parse(text ?? algo.input.default));
  };
  const last = (frames) => frames[frames.length - 1];

  it('sorts every sorting algorithm', () => {
    for (const algo of ALGORITHMS.filter((a) => a.category === 'sorting')) {
      const frames = run(algo.id);
      const values = last(frames).view.values;
      assert.deepEqual(values, [...values].sort((x, y) => x - y), algo.id);
    }
  });

  it('finds the target with both searches', () => {
    for (const id of ['linear-search', 'binary-search']) {
      const algo = ALGORITHMS.find((a) => a.id === id);
      const input = algo.input.parse(algo.input.default);
      const frames = runAlgorithm(id, input);
      assert.equal(last(frames).vars.result, input.values.indexOf(input.target));
    }
  });

  it('computes the gcd', () => {
    const frames = run('gcd', 'a: 1071\nb: 462');
    assert.equal(last(frames).vars.result, gcd(1071, 462));
  });

  it('sieves the primes', () => {
    const frames = run('sieve', 'n: 97');
    assert.deepEqual(last(frames).vars.result.split(',').map(Number), primesUpTo(97));
  });

  it('solves the tower of hanoi in 2^n - 1 moves', () => {
    const frames = run('hanoi', 'n: 5');
    assert.equal(last(frames).vars.moves, 31);
    assert.deepEqual(last(frames).view.pegs[2], [5, 4, 3, 2, 1]);
  });

  it('computes Fibonacci numbers', () => {
    assert.equal(last(run('fibonacci', 'n: 20')).vars.result, '6765');
  });

  it('matches the knapsack optimum', () => {
    assert.equal(last(run('knapsack')).vars.result, 9);
  });

  it('finds the LCS and the edit distance', () => {
    assert.equal(last(run('lcs')).vars.result, 'BCBA');
    assert.equal(last(run('edit-distance')).vars.result, 3);
  });

  it('finds the string matches', () => {
    assert.deepEqual(last(run('kmp')).view.found, [10]);
    assert.deepEqual(last(run('rabin-karp')).view.found, [0, 9, 12]);
  });

  it('places the queens', () => {
    const frames = run('n-queens', 'n: 8\nmode: first');
    const { queens, n } = last(frames).view;
    assert.equal(queens.length, n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        assert.notEqual(queens[i], queens[j]);
        assert.notEqual(Math.abs(queens[i] - queens[j]), j - i);
      }
    }
  });

  it('counts every n-queens solution for n = 4', () => {
    assert.equal(last(run('n-queens', 'n: 4\nmode: all')).vars.solutions, 2);
  });
});

describe('classroom algorithms', () => {
  const run = (id, text) => {
    const algo = ALGORITHMS.find((a) => a.id === id);
    const frames = runAlgorithm(id, algo.input.parse(text ?? algo.input.default));
    return frames[frames.length - 1];
  };

  it('BFS finds the shortest grid path and greedy best-first may not', () => {
    const grid = 'S...#....\n.##.#.##.\n....#..#G\n.#.......';
    assert.equal(run('grid-bfs', grid).vars.length, 12);
    assert.equal(run('astar', grid).vars.length, 12);
    assert.ok(run('greedy-best-first', grid).vars.length >= 12);
    assert.ok(run('maze-dfs', grid).vars.length >= 12);
    assert.equal(run('grid-bfs', 'S#.\n##.\n..G').vars.length, undefined);
    assert.equal(run('maze-dfs', 'S#.\n##.\n..G').vars.length, undefined);
  });

  it('finds a subset with the target sum, or none', () => {
    assert.equal(run('subset-sum').vars.result, '3 4 2');
    assert.equal(run('subset-sum', 'values: 2 4 6\ntarget: 5').vars.result, 'none');
  });

  it('generates n! permutations', () => {
    assert.equal(run('permutations', 'items: 1 2 3 4 5').vars.count, 120);
    assert.equal(run('permutations').view.output, '1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1');
  });

  it('solves the sudoku and keeps the givens', () => {
    const algo = ALGORITHMS.find((a) => a.id === 'sudoku');
    const { cells } = algo.input.parse(algo.input.default);
    const solved = run('sudoku').vars.result.replace(/\n/g, '').split('').map(Number);
    cells.forEach((v, i) => { if (v) assert.equal(solved[i], v); });
    for (let k = 0; k < 9; k++) {
      assert.equal(new Set(solved.slice(k * 9, k * 9 + 9)).size, 9);
      assert.equal(new Set(solved.filter((_, i) => i % 9 === k)).size, 9);
    }
    assert.equal(run('sudoku', '55.......\n.........\n.........\n.........\n.........\n.........\n.........\n.........\n.........').vars.result, 'none');
  });

  it('computes Huffman, fractional knapsack and job sequencing', () => {
    assert.equal(run('huffman').vars.result, 23);
    assert.equal(run('huffman', 'text: AAAA').vars.result, 4);
    assert.equal(run('fractional-knapsack').vars.result, '240.00');
    assert.equal(run('fractional-knapsack', 'weights: 3\nvalues: 1\ncapacity: 1').vars.result, '0.33');
    assert.equal(run('job-sequencing').vars.result, 'J3 J1 J5\n142');
  });

  it('keeps the AVL tree balanced', () => {
    assert.equal(run('avl-tree').vars.result, '30 20 10 25 40 50');
    assert.equal(run('avl-tree', 'values: 1 2 3 4 5 6 7').vars.height, 3);
  });

  it('keeps the min-heap order and extracts in ascending order', () => {
    const lastFrame = run('binary-heap');
    assert.equal(lastFrame.vars.heap, '1 3 2 5 9 8 7');
    assert.equal(lastFrame.vars.result, '1 2 3');
  });

  it('lists the words with a prefix from the trie', () => {
    assert.equal(run('trie').vars.result, 'tea ten tent');
    assert.equal(run('trie', 'words: car cat\nfind: d').vars.result, 'none');
  });
});
