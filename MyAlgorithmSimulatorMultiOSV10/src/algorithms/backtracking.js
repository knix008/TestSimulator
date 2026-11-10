import { L, record, parseKeyed, parseInteger, randInt } from './core.js';

export const nQueens = {
  id: 'n-queens', category: 'backtracking', view: 'board',
  name: L('N-Queens (백트래킹)', 'N-Queens (Backtracking)'),
  summary: L('서로 공격하지 않게 N 개의 퀸을 놓습니다.', 'Places N queens so that none attack each other.'),
  description: L(
    'N×N 체스판에 퀸 N 개를 **같은 행·열·대각선에 두 개가 없도록** 놓는 문제입니다. 한 행에 하나씩 퀸을 놓아 보고, 더 진행할 수 없으면 직전 선택을 취소하고(**백트래킹**) 다음 칸을 시도합니다.\n\n백트래킹은 "해가 될 수 없는 가지는 일찍 잘라내는" 완전 탐색으로, 스도쿠·조합·순열 문제에도 쓰입니다. mode: all 이면 모든 해를 찾습니다(큰 N 은 단계가 매우 많습니다).',
    'Place N queens on an N×N board so that **no two share a row, column or diagonal**. Queens are placed one row at a time; when a row has no safe square the previous choice is undone (**backtracking**) and the next square is tried.\n\nBacktracking is exhaustive search that prunes branches which cannot lead to a solution — also used for sudoku, combinations and permutations. With mode: all every solution is found (large N takes many steps).'),
  complexity: { best: 'O(N!)', average: 'O(N!)', worst: 'O(N!)', space: 'O(N)' },
  traits: L('백트래킹 · 재귀 · 완전 탐색', 'Backtracking · Recursion · Exhaustive search'),
  input: {
    default: 'n: 6\nmode: first',
    hint: L('n: 판 크기 (4~10), mode: first(첫 해) 또는 all(모든 해)', 'n: board size (4–10), mode: first (first solution) or all (every solution)'),
    parse(text) {
      const { keys } = parseKeyed(text);
      const n = parseInteger(keys.n ?? text, 'n', 4, 10);
      const mode = (keys.mode ?? 'first').toLowerCase() === 'all' ? 'all' : 'first';
      return { n, mode };
    },
    random: () => `n: ${randInt(4, 8)}\nmode: first`,
  },
  pseudo: [
    'procedure solve(row)',
    '  if row = n: record a solution; return',
    '  for col ← 0 to n − 1',
    '    if safe(row, col)       // no queen in the same column or diagonal',
    '      place a queen at (row, col)',
    '      solve(row + 1)',
    '      remove the queen from (row, col)   // backtrack',
  ],
  run({ n, mode }) {
    return record((r) => {
      const queens = Array(n).fill(-1);
      const solutions = [];
      const view = (extra = {}) => ({ kind: 'board', n, queens: [...queens], solutions: solutions.length, ...extra });
      const attackers = (row, col) => {
        const list = [];
        for (let rr = 0; rr < row; rr++) {
          const c = queens[rr];
          if (c === col || Math.abs(c - col) === row - rr) list.push([rr, c]);
        }
        return list;
      };
      let stop = false;
      r.step(0, L(`${n}×${n} 판에 퀸 ${n}개를 놓습니다.`, `Place ${n} queens on a ${n}×${n} board.`), view(), { n });
      const solve = (row) => {
        if (row === n) {
          solutions.push([...queens]);
          r.step(1, L(`해 #${solutions.length} 발견!`, `Solution #${solutions.length} found!`), view({ solved: true }), { solutions: solutions.length });
          if (mode === 'first') stop = true;
          return;
        }
        for (let col = 0; col < n && !stop; col++) {
          const hits = attackers(row, col);
          r.step(3, hits.length
            ? L(`(${row}, ${col}) 은(는) 공격받습니다 → 건너뜀`, `(${row}, ${col}) is attacked → skip`)
            : L(`(${row}, ${col}) 은(는) 안전합니다`, `(${row}, ${col}) is safe`), view({ probe: [row, col], conflicts: hits, ok: !hits.length }), { row, col });
          if (hits.length) continue;
          queens[row] = col;
          r.step(4, L(`(${row}, ${col}) 에 퀸을 놓습니다.`, `Place a queen at (${row}, ${col}).`), view({ placed: [row, col] }), { row, col });
          solve(row + 1);
          if (stop) return;
          queens[row] = -1;
          r.step(6, L(`(${row}, ${col}) 의 퀸을 치우고 다음 칸을 시도합니다 (백트래킹).`, `Remove the queen at (${row}, ${col}) and try the next square (backtrack).`), view({ removed: [row, col] }), { row, col });
        }
      };
      solve(0);
      const done = solutions.length;
      r.step(1, mode === 'first'
        ? (done ? L('첫 번째 해를 찾았습니다.', 'Found the first solution.') : L('해가 없습니다.', 'No solution.'))
        : L(`탐색 완료: 해 ${done}개`, `Search complete: ${done} solutions`), { ...view({ solved: done > 0 }), queens: done ? [...solutions[mode === 'first' ? 0 : done - 1]] : queens }, { solutions: done });
    });
  },
};

export const BACKTRACKING = [nQueens];
