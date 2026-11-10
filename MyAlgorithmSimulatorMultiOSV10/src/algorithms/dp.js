import { L, record, parseKeyed, parseNumbers, parseInteger, InputError, randInt, randomArray } from './core.js';

/** Table view snapshot. colors: "r,c" → active | compare | source | write | path | done | dim */
export function tableView({ title = null, rowHeaders, colHeaders, cells, colors = {}, footer = null }) {
  return { kind: 'table', title, rowHeaders: [...rowHeaders], colHeaders: [...colHeaders], cells: cells.map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c)))), colors: { ...colors }, footer };
}

export const fibonacci = {
  id: 'fibonacci', category: 'dp', view: 'table',
  name: L('피보나치 수 (DP)', 'Fibonacci (DP)'),
  summary: L('작은 문제의 답을 표에 저장해 다시 씁니다.', 'Stores answers to small subproblems and reuses them.'),
  description: L(
    '피보나치 수열은 F(n) = F(n−1) + F(n−2) 입니다. 그대로 재귀로 계산하면 같은 값을 수없이 다시 계산해 O(2ⁿ) 이 걸리지만, **동적 계획법**으로 작은 값부터 표에 채워 나가면 O(n) 이면 됩니다.\n\n이것이 DP 의 핵심 아이디어인 **"한 번 푼 문제는 저장해 두고 다시 쓴다"** 입니다.',
    'The Fibonacci numbers satisfy F(n) = F(n−1) + F(n−2). Plain recursion recomputes the same values over and over (O(2ⁿ)), but **dynamic programming** fills a table from the smallest values up in O(n).\n\nThat is the core idea of DP: **solve each subproblem once, store it, reuse it**.'),
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(n)' },
  traits: L('동적 계획법 · 상향식(bottom-up)', 'Dynamic programming · Bottom-up'),
  input: {
    default: 'n: 20',
    hint: L('n: 계산할 항 (1~60)', 'n: the term to compute (1–60)'),
    parse: (text) => parseInteger(parseKeyed(text).keys.n ?? text, 'n', 1, 60),
    random: () => `n: ${randInt(8, 40)}`,
  },
  pseudo: [
    'procedure fib(n)',
    '  F[0] ← 0; F[1] ← 1',
    '  for i ← 2 to n',
    '    F[i] ← F[i − 1] + F[i − 2]',
    '  return F[n]',
  ],
  run(n) {
    const per = 10;
    const rowsN = Math.floor(n / per) + 1;
    const F = Array(n + 1).fill(null);
    const at = (i) => `${Math.floor(i / per)},${i % per}`;
    const cells = () => Array.from({ length: rowsN }, (_, r) => Array.from({ length: per }, (_, c) => { const i = r * per + c; return i <= n ? (F[i] === null ? '' : String(F[i])) : null; }));
    const view = (colors = {}) => tableView({ rowHeaders: Array.from({ length: rowsN }, (_, r) => `${r * per}`), colHeaders: Array.from({ length: per }, (_, c) => `+${c}`), cells: cells(), colors });
    return record((r) => {
      F[0] = 0n;
      if (n >= 1) F[1] = 1n;
      r.step(1, L('F[0] = 0, F[1] = 1', 'F[0] = 0, F[1] = 1'), view({ [at(0)]: 'write', ...(n >= 1 ? { [at(1)]: 'write' } : {}) }), { n });
      for (let i = 2; i <= n; i++) {
        r.step(3, L(`F[${i}] = F[${i - 1}] + F[${i - 2}] = ${F[i - 1]} + ${F[i - 2]}`, `F[${i}] = F[${i - 1}] + F[${i - 2}] = ${F[i - 1]} + ${F[i - 2]}`), view({ [at(i - 1)]: 'source', [at(i - 2)]: 'source', [at(i)]: 'active' }), { i });
        F[i] = F[i - 1] + F[i - 2];
        r.step(3, L(`F[${i}] = ${F[i]}`, `F[${i}] = ${F[i]}`), view({ [at(i)]: 'write' }), { i, [`F[${i}]`]: String(F[i]) });
      }
      r.step(4, L(`F(${n}) = ${F[n]}`, `F(${n}) = ${F[n]}`), view({ [at(n)]: 'found' }), { result: String(F[n]) });
    });
  },
};

export const knapsack = {
  id: 'knapsack', category: 'dp', view: 'table',
  name: L('0/1 배낭 문제', '0/1 Knapsack'),
  summary: L('무게 한도 안에서 가치의 합이 최대가 되도록 물건을 고릅니다.', 'Picks items maximising value within a weight limit.'),
  description: L(
    '무게 w[i], 가치 v[i] 인 물건들 중 일부를 골라 배낭(용량 W)에 넣을 때 **가치의 합을 최대**로 하는 문제입니다. 물건은 넣거나(1) 안 넣거나(0) 둘 중 하나입니다.\n\nK[i][c] = "처음 i 개 물건으로 용량 c 에서 얻을 수 있는 최대 가치" 를 표로 채웁니다. 각 칸은 **물건 i 를 넣지 않는 경우(위 칸)**와 **넣는 경우(왼쪽 위 칸 + v[i])** 중 큰 값입니다. 마지막에 표를 거꾸로 따라가 고른 물건을 찾습니다.',
    'Choose some of the items (weight w[i], value v[i]) to put in a knapsack of capacity W so that the **total value is as large as possible**. Each item is either taken (1) or left (0).\n\nK[i][c] = "the best value using the first i items with capacity c". Each cell is the larger of **leaving item i (the cell above)** and **taking it (the cell up-left + v[i])**. Tracing back through the table reveals the chosen items.'),
  complexity: { best: 'O(n·W)', average: 'O(n·W)', worst: 'O(n·W)', space: 'O(n·W)' },
  traits: L('동적 계획법 · 최적화', 'Dynamic programming · Optimisation'),
  input: {
    default: 'weights: 1, 3, 4, 5\nvalues: 1, 4, 5, 7\ncapacity: 7',
    hint: L('weights: 무게 목록, values: 가치 목록, capacity: 배낭 용량 (물건 1~10개, 용량 1~20)', 'weights: list, values: list, capacity: limit (1–10 items, capacity 1–20)'),
    parse(text) {
      const { keys } = parseKeyed(text);
      const weights = parseNumbers(keys.weights ?? '', { min: 1, max: 10, lo: 1, hi: 20 });
      const values = parseNumbers(keys.values ?? '', { min: 1, max: 10, lo: 0, hi: 999 });
      if (weights.length !== values.length) throw new InputError('weights 와 values 의 개수가 같아야 합니다.', 'weights and values must have the same length.');
      const capacity = parseInteger(keys.capacity, 'capacity', 1, 20);
      return { weights, values, capacity };
    },
    random() {
      const n = randInt(3, 6);
      return `weights: ${randomArray(n, 1, 8).join(', ')}\nvalues: ${randomArray(n, 1, 20).join(', ')}\ncapacity: ${randInt(6, 15)}`;
    },
  },
  pseudo: [
    'procedure knapsack(w, v, W)',
    '  K[0][c] ← 0 for every capacity c',
    '  for i ← 1 to n',
    '    for c ← 0 to W',
    '      K[i][c] ← K[i − 1][c]            // leave item i',
    '      if w[i] ≤ c',
    '        K[i][c] ← max(K[i][c], K[i − 1][c − w[i]] + v[i])   // take it',
    '  trace back from K[n][W] to find the chosen items',
    '  return K[n][W]',
  ],
  run({ weights, values, capacity: W }) {
    const n = weights.length;
    const K = Array.from({ length: n + 1 }, () => Array(W + 1).fill(null));
    const rowHeaders = ['0', ...weights.map((w, i) => `#${i + 1} (w${w}, v${values[i]})`)];
    const colHeaders = Array.from({ length: W + 1 }, (_, c) => String(c));
    const view = (colors = {}, footer = null) => tableView({ rowHeaders, colHeaders, cells: K, colors, footer });
    return record((r) => {
      for (let c = 0; c <= W; c++) K[0][c] = 0;
      r.step(1, L('물건이 하나도 없으면 가치는 0', 'With no items the value is 0'), view(Object.fromEntries(colHeaders.map((_, c) => [`0,${c}`, 'write']))), {});
      for (let i = 1; i <= n; i++) {
        const w = weights[i - 1];
        const v = values[i - 1];
        r.step(2, L(`물건 #${i} (무게 ${w}, 가치 ${v}) 를 고려합니다.`, `Consider item #${i} (weight ${w}, value ${v}).`), view(), { i, w, v });
        for (let c = 0; c <= W; c++) {
          K[i][c] = K[i - 1][c];
          if (w <= c) {
            const take = K[i - 1][c - w] + v;
            const better = take > K[i][c];
            r.step(6, L(`K[${i}][${c}] = max(넣지 않음 ${K[i - 1][c]}, 넣음 ${K[i - 1][c - w]} + ${v} = ${take})`, `K[${i}][${c}] = max(leave ${K[i - 1][c]}, take ${K[i - 1][c - w]} + ${v} = ${take})`), view({ [`${i - 1},${c}`]: 'source', [`${i - 1},${c - w}`]: 'compare', [`${i},${c}`]: 'active' }), { i, c, leave: K[i - 1][c], take });
            if (better) K[i][c] = take;
          } else {
            r.step(4, L(`용량 ${c} < 무게 ${w}: 넣을 수 없으므로 K[${i}][${c}] = ${K[i][c]}`, `Capacity ${c} < weight ${w}: cannot take, K[${i}][${c}] = ${K[i][c]}`), view({ [`${i - 1},${c}`]: 'source', [`${i},${c}`]: 'active' }), { i, c });
          }
        }
      }
      const path = {};
      const chosen = [];
      let c = W;
      for (let i = n; i >= 1; i--) {
        path[`${i},${c}`] = 'path';
        if (K[i][c] !== K[i - 1][c]) { chosen.unshift(i); c -= weights[i - 1]; }
      }
      path[`0,${c}`] = 'path';
      const footer = L(`고른 물건: ${chosen.map((i) => `#${i}`).join(', ') || '없음'} · 최대 가치 ${K[n][W]}`, `Chosen: ${chosen.map((i) => `#${i}`).join(', ') || 'none'} · Best value ${K[n][W]}`);
      r.step(7, L('표를 거꾸로 따라가며 고른 물건을 찾습니다.', 'Trace back to find the chosen items.'), view(path, footer), {});
      r.step(8, L(`최대 가치 = ${K[n][W]}`, `Best value = ${K[n][W]}`), view({ ...path, [`${n},${W}`]: 'found' }, footer), { result: K[n][W], items: chosen.join(',') });
    });
  },
};

const twoStrings = (def, keysName = ['a', 'b']) => ({
  default: def,
  hint: L(`${keysName[0]}: 첫 문자열, ${keysName[1]}: 둘째 문자열 (각 1~16자)`, `${keysName[0]}: first string, ${keysName[1]}: second string (1–16 characters each)`),
  parse(text) {
    const { keys } = parseKeyed(text);
    const a = (keys[keysName[0]] ?? '').trim();
    const b = (keys[keysName[1]] ?? '').trim();
    if (!a || !b || a.length > 16 || b.length > 16) throw new InputError('두 문자열을 각각 1~16자로 입력하세요.', 'Enter two strings of 1–16 characters.');
    return { a, b };
  },
  random() {
    const pick = (n) => Array.from({ length: n }, () => 'ABCD'[randInt(0, 3)]).join('');
    return `${keysName[0]}: ${pick(randInt(5, 9))}\n${keysName[1]}: ${pick(randInt(5, 9))}`;
  },
});

export const lcs = {
  id: 'lcs', category: 'dp', view: 'table',
  name: L('최장 공통 부분 수열 (LCS)', 'Longest Common Subsequence'),
  summary: L('두 문자열에 공통으로 들어 있는 가장 긴 부분 수열을 찾습니다.', 'Finds the longest subsequence common to two strings.'),
  description: L(
    '부분 수열은 순서를 지키면서 몇 글자를 골라 만든 문자열입니다(연속일 필요 없음). **LCS** 는 두 문자열 모두의 부분 수열 중 가장 긴 것입니다. diff 도구, DNA 비교 등에 쓰입니다.\n\nC[i][j] = X 의 앞 i 글자와 Y 의 앞 j 글자의 LCS 길이. 글자가 같으면 **대각선 + 1**, 다르면 **위와 왼쪽 중 큰 값**입니다.',
    'A subsequence keeps the order of the characters it picks (not necessarily adjacent). The **LCS** is the longest subsequence of both strings — used by diff tools and DNA comparison.\n\nC[i][j] = the LCS length of the first i characters of X and the first j of Y. Equal characters give **diagonal + 1**, otherwise **the larger of up and left**.'),
  complexity: { best: 'O(m·n)', average: 'O(m·n)', worst: 'O(m·n)', space: 'O(m·n)' },
  traits: L('동적 계획법 · 문자열', 'Dynamic programming · Strings'),
  input: twoStrings('a: ABCBDAB\nb: BDCABA'),
  pseudo: [
    'procedure LCS(X, Y)',
    '  C[i][0] ← 0; C[0][j] ← 0',
    '  for i ← 1 to m',
    '    for j ← 1 to n',
    '      if X[i] = Y[j]',
    '        C[i][j] ← C[i − 1][j − 1] + 1',
    '      else C[i][j] ← max(C[i − 1][j], C[i][j − 1])',
    '  trace back from C[m][n] to read the LCS',
  ],
  run({ a: X, b: Y }) {
    const m = X.length;
    const n = Y.length;
    const C = Array.from({ length: m + 1 }, () => Array(n + 1).fill(null));
    const rowHeaders = ['ε', ...X];
    const colHeaders = ['ε', ...Y];
    const view = (colors = {}, footer = null) => tableView({ rowHeaders, colHeaders, cells: C, colors, footer });
    return record((r) => {
      for (let i = 0; i <= m; i++) C[i][0] = 0;
      for (let j = 0; j <= n; j++) C[0][j] = 0;
      r.step(1, L('빈 문자열과의 LCS 는 0', 'The LCS with an empty string is 0'), view(), {});
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (X[i - 1] === Y[j - 1]) {
            C[i][j] = C[i - 1][j - 1] + 1;
            r.step(5, L(`X[${i}] = Y[${j}] = '${X[i - 1]}' → 대각선 + 1 = ${C[i][j]}`, `X[${i}] = Y[${j}] = '${X[i - 1]}' → diagonal + 1 = ${C[i][j]}`), view({ [`${i - 1},${j - 1}`]: 'source', [`${i},${j}`]: 'write' }), { i, j });
          } else {
            C[i][j] = Math.max(C[i - 1][j], C[i][j - 1]);
            r.step(6, L(`'${X[i - 1]}' ≠ '${Y[j - 1]}' → max(위 ${C[i - 1][j]}, 왼쪽 ${C[i][j - 1]}) = ${C[i][j]}`, `'${X[i - 1]}' ≠ '${Y[j - 1]}' → max(up ${C[i - 1][j]}, left ${C[i][j - 1]}) = ${C[i][j]}`), view({ [`${i - 1},${j}`]: 'compare', [`${i},${j - 1}`]: 'compare', [`${i},${j}`]: 'active' }), { i, j });
          }
        }
      }
      const path = {};
      let i = m;
      let j = n;
      let s = '';
      while (i > 0 && j > 0) {
        if (X[i - 1] === Y[j - 1]) { path[`${i},${j}`] = 'found'; s = X[i - 1] + s; i--; j--; }
        else { path[`${i},${j}`] = 'path'; if (C[i - 1][j] >= C[i][j - 1]) i--; else j--; }
      }
      const footer = L(`LCS = "${s}" (길이 ${s.length})`, `LCS = "${s}" (length ${s.length})`);
      r.step(7, L(`오른쪽 아래에서 거꾸로 따라가면 LCS = "${s}"`, `Tracing back from the bottom right: LCS = "${s}"`), view(path, footer), { result: s, length: s.length });
    });
  },
};

export const editDistance = {
  id: 'edit-distance', category: 'dp', view: 'table',
  name: L('편집 거리 (레벤슈타인)', 'Edit Distance (Levenshtein)'),
  summary: L('한 문자열을 다른 문자열로 바꾸는 최소 편집 횟수입니다.', 'The fewest edits turning one string into another.'),
  description: L(
    '편집 거리는 삽입·삭제·교체 세 가지 연산으로 문자열 A 를 B 로 바꾸는 **최소 연산 횟수**입니다. 맞춤법 검사, 검색어 추천 등에 쓰입니다.\n\nD[i][j] = A 의 앞 i 글자를 B 의 앞 j 글자로 바꾸는 최소 비용. 글자가 같으면 대각선 값을 그대로, 다르면 **위(삭제)·왼쪽(삽입)·대각선(교체)** 중 최솟값 + 1 입니다.',
    'The edit distance is the **fewest insertions, deletions and replacements** that turn string A into B — used by spell checkers and search suggestions.\n\nD[i][j] = the cost of turning the first i characters of A into the first j of B. Equal characters copy the diagonal; otherwise it is 1 + the minimum of **up (delete), left (insert) and diagonal (replace)**.'),
  complexity: { best: 'O(m·n)', average: 'O(m·n)', worst: 'O(m·n)', space: 'O(m·n)' },
  traits: L('동적 계획법 · 문자열', 'Dynamic programming · Strings'),
  input: twoStrings('a: kitten\nb: sitting'),
  pseudo: [
    'procedure editDistance(A, B)',
    '  D[i][0] ← i; D[0][j] ← j',
    '  for i ← 1 to m',
    '    for j ← 1 to n',
    '      if A[i] = B[j]: D[i][j] ← D[i − 1][j − 1]',
    '      else D[i][j] ← 1 + min(D[i − 1][j],      // delete',
    '                             D[i][j − 1],      // insert',
    '                             D[i − 1][j − 1])  // replace',
    '  return D[m][n]',
  ],
  run({ a: A, b: B }) {
    const m = A.length;
    const n = B.length;
    const D = Array.from({ length: m + 1 }, () => Array(n + 1).fill(null));
    const rowHeaders = ['ε', ...A];
    const colHeaders = ['ε', ...B];
    const view = (colors = {}, footer = null) => tableView({ rowHeaders, colHeaders, cells: D, colors, footer });
    return record((r) => {
      for (let i = 0; i <= m; i++) D[i][0] = i;
      for (let j = 0; j <= n; j++) D[0][j] = j;
      r.step(1, L('빈 문자열로/에서 바꾸려면 글자 수만큼 삭제/삽입', 'To or from an empty string: delete or insert every character'), view(), {});
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (A[i - 1] === B[j - 1]) {
            D[i][j] = D[i - 1][j - 1];
            r.step(4, L(`'${A[i - 1]}' = '${B[j - 1]}' → 대각선 값 ${D[i][j]}`, `'${A[i - 1]}' = '${B[j - 1]}' → diagonal ${D[i][j]}`), view({ [`${i - 1},${j - 1}`]: 'source', [`${i},${j}`]: 'write' }), { i, j });
          } else {
            const del = D[i - 1][j];
            const ins = D[i][j - 1];
            const rep = D[i - 1][j - 1];
            D[i][j] = 1 + Math.min(del, ins, rep);
            r.step(5, L(`'${A[i - 1]}' ≠ '${B[j - 1]}' → 1 + min(삭제 ${del}, 삽입 ${ins}, 교체 ${rep}) = ${D[i][j]}`, `'${A[i - 1]}' ≠ '${B[j - 1]}' → 1 + min(delete ${del}, insert ${ins}, replace ${rep}) = ${D[i][j]}`), view({ [`${i - 1},${j}`]: 'compare', [`${i},${j - 1}`]: 'compare', [`${i - 1},${j - 1}`]: 'compare', [`${i},${j}`]: 'active' }), { i, j });
          }
        }
      }
      const footer = L(`"${A}" → "${B}" 편집 거리 = ${D[m][n]}`, `"${A}" → "${B}" edit distance = ${D[m][n]}`);
      r.step(8, L(`편집 거리 = ${D[m][n]}`, `Edit distance = ${D[m][n]}`), view({ [`${m},${n}`]: 'found' }, footer), { result: D[m][n] });
    });
  },
};

export const DP = [fibonacci, knapsack, lcs, editDistance];
