import { L, record, parseKeyed, parseInteger, randInt } from './core.js';

const twoNumbers = (def, lo, hi) => ({
  default: def,
  hint: L(`a: 와 b: 정수 (${lo}~${hi})`, `a: and b: integers (${lo}–${hi})`),
  parse(text) {
    const { keys } = parseKeyed(text);
    return { a: parseInteger(keys.a, 'a', lo, hi), b: parseInteger(keys.b, 'b', lo, hi) };
  },
  random: () => `a: ${randInt(Math.max(lo, 2), hi)}\nb: ${randInt(Math.max(lo, 2), hi)}`,
});

export const euclid = {
  id: 'gcd', category: 'math', view: 'table',
  name: L('유클리드 호제법 (최대공약수)', "Euclid's Algorithm (GCD)"),
  summary: L('큰 수를 작은 수로 나눈 나머지로 바꿔 가며 최대공약수를 구합니다.', 'Replaces the larger number by the remainder until one becomes zero.'),
  description: L(
    '두 수의 최대공약수(GCD)는 **큰 수를 작은 수로 나눈 나머지**와 작은 수의 최대공약수와 같습니다: gcd(a, b) = gcd(b, a mod b). 나머지가 0이 되면 나누는 수가 최대공약수입니다.\n\n2,300년 전 유클리드의 《원론》에 나온, 알려진 가장 오래된 알고리즘 중 하나입니다. 단계 수는 숫자의 자릿수에 비례합니다(O(log min(a, b))).',
    'The greatest common divisor of two numbers equals the GCD of the smaller one and the **remainder** of the division: gcd(a, b) = gcd(b, a mod b). When the remainder is 0, the divisor is the answer.\n\nIt appears in Euclid\'s *Elements* 2,300 years ago — one of the oldest known algorithms — and the number of steps is proportional to the number of digits (O(log min(a, b))).'),
  complexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)', space: 'O(1)' },
  traits: L('수론 · 재귀', 'Number theory · Recursion'),
  input: twoNumbers('a: 1071\nb: 462', 1, 1000000),
  pseudo: [
    'procedure gcd(a, b)',
    '  while b ≠ 0',
    '    r ← a mod b',
    '    a ← b',
    '    b ← r',
    '  return a',
  ],
  run({ a, b }) {
    return record((r) => {
      const rows = [];
      const view = (colors = {}, footer = null) => ({
        kind: 'table', title: L('나눗셈 과정', 'Division steps'), rowHeaders: rows.map((_, i) => String(i + 1)),
        colHeaders: ['a', 'b', 'a mod b'], cells: rows.map((row) => row.map(String)), colors, footer,
      });
      r.step(1, L(`gcd(${a}, ${b}) 를 구합니다.`, `Compute gcd(${a}, ${b}).`), view(), { a, b });
      while (b !== 0) {
        const rem = a % b;
        rows.push([a, b, rem]);
        r.step(2, L(`${a} = ${b} × ${Math.floor(a / b)} + ${rem}`, `${a} = ${b} × ${Math.floor(a / b)} + ${rem}`), view({ [`${rows.length - 1},2`]: 'write' }), { a, b, r: rem });
        a = b;
        b = rem;
        r.step(3, L(`a ← ${a}, b ← ${b}`, `a ← ${a}, b ← ${b}`), view(), { a, b });
      }
      r.step(5, L(`b = 0 → 최대공약수 = ${a}`, `b = 0 → the GCD is ${a}`), view({}, L(`최대공약수 = ${a}`, `GCD = ${a}`)), { result: a });
    });
  },
};

export const sieve = {
  id: 'sieve', category: 'math', view: 'grid',
  name: L('에라토스테네스의 체', 'Sieve of Eratosthenes'),
  summary: L('배수를 차례로 지워 소수를 남깁니다.', 'Crosses out multiples and the primes remain.'),
  description: L(
    '2부터 √n 이하의 소수 p 마다 **p 의 배수를 모두 지웁니다**. 지워지지 않고 남은 수가 소수입니다. 2의 배수, 3의 배수, 5의 배수… 순으로 체를 치는 방식이라 "체"라고 부릅니다.\n\np² 부터 지우면 됩니다. 더 작은 배수는 이미 더 작은 소수가 지웠기 때문입니다. n 까지의 소수를 O(n log log n) 에 모두 구합니다.',
    'For every prime p up to √n, **cross out all multiples of p**. Whatever survives is prime. The multiples of 2, then of 3, then of 5… are sieved out — hence the "sieve".\n\nCrossing out can start at p²: every smaller multiple was already removed by a smaller prime. All primes up to n are found in O(n log log n).'),
  complexity: { best: 'O(n log log n)', average: 'O(n log log n)', worst: 'O(n log log n)', space: 'O(n)' },
  traits: L('수론 · 소수', 'Number theory · Primes'),
  input: {
    default: 'n: 100',
    hint: L('n: 여기까지의 소수를 구합니다 (2~400)', 'n: find the primes up to here (2–400)'),
    parse: (text) => parseInteger(parseKeyed(text).keys.n ?? text, 'n', 2, 400),
    random: () => `n: ${randInt(30, 200)}`,
  },
  pseudo: [
    'procedure sieve(n)',
    '  prime[2..n] ← true',
    '  for p ← 2 to √n',
    '    if prime[p]',
    '      for m ← p², p² + p, … while m ≤ n',
    '        prime[m] ← false',
    '  return all p where prime[p]',
  ],
  run(n) {
    const cols = Math.min(20, n);
    const rows = Math.ceil(n / cols);
    return record((r) => {
      const prime = Array(n + 1).fill(true);
      prime[1] = false;
      const state = Array(n).fill('open');
      const values = Array.from({ length: n }, (_, i) => i + 1);
      const pad = Math.max(0, rows * cols - n);
      const view = (extra = {}) => ({ kind: 'grid', rows, cols, start: -1, goal: -1, cells: [...state, ...Array(pad).fill('empty')], values: [...values, ...Array(pad).fill('')], ...extra });
      r.step(1, L('1 은 소수가 아니므로 지웁니다.', '1 is not prime: cross it out.'), (() => { state[0] = 'wall'; return view(); })(), { n });
      for (let p = 2; p * p <= n; p++) {
        if (!prime[p]) continue;
        r.step(3, L(`${p} 은(는) 소수입니다. ${p}² = ${p * p} 부터 배수를 지웁니다.`, `${p} is prime. Cross out its multiples from ${p * p}.`), view({ current: p - 1 }), { p });
        for (let m = p * p; m <= n; m += p) {
          if (prime[m]) {
            prime[m] = false;
            state[m - 1] = 'closed';
            r.step(5, L(`${m} = ${p} × ${m / p} → 지웁니다.`, `${m} = ${p} × ${m / p} → crossed out.`), view({ current: p - 1, probe: m - 1 }), { p, m });
          }
        }
        state[p - 1] = 'path';
      }
      const primes = [];
      for (let p = 2; p <= n; p++) if (prime[p]) { primes.push(p); state[p - 1] = 'path'; }
      r.step(6, L(`${n} 까지의 소수 ${primes.length}개: ${primes.join(', ')}`, `${primes.length} primes up to ${n}: ${primes.join(', ')}`), view(), { count: primes.length, result: primes.join(',') });
    });
  },
};

export const hanoi = {
  id: 'hanoi', category: 'math', view: 'hanoi',
  name: L('하노이 탑', 'Tower of Hanoi'),
  summary: L('원반을 한 기둥에서 다른 기둥으로 규칙을 지켜 옮깁니다.', 'Moves the stack of discs from one peg to another, following the rules.'),
  description: L(
    '세 기둥과 크기 순으로 쌓인 원반이 있습니다. **한 번에 하나씩**, 그리고 **큰 원반을 작은 원반 위에 놓지 않고** 전체를 다른 기둥으로 옮겨야 합니다.\n\n재귀로 풀면 놀라울 만큼 단순합니다: n − 1 개를 보조 기둥으로 옮기고, 가장 큰 원반을 목표 기둥으로 옮긴 다음, n − 1 개를 그 위로 옮깁니다. 이동 횟수는 정확히 2ⁿ − 1 번입니다.',
    'Three pegs, and discs stacked largest to smallest. Move the whole stack to another peg, **one disc at a time**, never putting a **larger disc on a smaller one**.\n\nRecursion makes it remarkably simple: move n − 1 discs to the spare peg, move the largest disc to the target, then move the n − 1 on top of it. It always takes exactly 2ⁿ − 1 moves.'),
  complexity: { best: 'O(2ⁿ)', average: 'O(2ⁿ)', worst: 'O(2ⁿ)', space: 'O(n)' },
  traits: L('재귀 · 분할 정복', 'Recursion · Divide and conquer'),
  input: {
    default: 'n: 4',
    hint: L('n: 원반 수 (1~8)', 'n: number of discs (1–8)'),
    parse: (text) => parseInteger(parseKeyed(text).keys.n ?? text, 'n', 1, 8),
    random: () => `n: ${randInt(3, 6)}`,
  },
  pseudo: [
    'procedure hanoi(n, from, to, spare)',
    '  if n = 0: return',
    '  hanoi(n − 1, from, spare, to)',
    '  move the top disc from "from" to "to"',
    '  hanoi(n − 1, spare, to, from)',
  ],
  run(n) {
    return record((r) => {
      const pegs = [Array.from({ length: n }, (_, i) => n - i), [], []];
      const names = ['A', 'B', 'C'];
      let moves = 0;
      const view = (move = null) => ({ kind: 'hanoi', pegs: pegs.map((p) => [...p]), n, move, moves });
      r.step(1, L(`원반 ${n}개를 A 에서 C 로 옮깁니다 (총 ${2 ** n - 1}번).`, `Move ${n} discs from A to C (${2 ** n - 1} moves in all).`), view(), { n });
      const solve = (k, from, to, spare) => {
        if (k === 0) return;
        r.step(2, L(`원반 ${k}개를 ${names[from]} → ${names[to]} (보조 ${names[spare]})`, `Move ${k} discs ${names[from]} → ${names[to]} (spare ${names[spare]})`), view(), { k, from: names[from], to: names[to] });
        solve(k - 1, from, spare, to);
        const disc = pegs[from].pop();
        pegs[to].push(disc);
        moves++;
        r.step(3, L(`${moves}번째 이동: 원반 ${disc} 을(를) ${names[from]} → ${names[to]}`, `Move ${moves}: disc ${disc} from ${names[from]} to ${names[to]}`), view({ disc, from, to }), { moves, disc, from: names[from], to: names[to] });
        solve(k - 1, spare, to, from);
      };
      solve(n, 0, 2, 1);
      r.step(4, L(`완료! ${moves}번 이동했습니다.`, `Done in ${moves} moves.`), view(), { moves });
    });
  },
};

export const MATH = [euclid, sieve, hanoi];
