// More textbook algorithms: sorts, searches, selection, DP, greedy, arithmetic and a naive string search.
import { L, record, parseNumbers, parseKeyed, parseInteger, randomArray, randInt, InputError } from './core.js';
import { arrayView } from './sorting.js';
import { tableView } from './dp.js';

const numbers = (def, { lo = 1, hi = 99, min = 2, max = 40, n = 10 } = {}) => ({
  default: def,
  hint: L(`정수 ${min}~${max}개 (${lo}~${hi})`, `Integers, ${min}–${max} values (${lo}–${hi})`),
  parse: (text) => parseNumbers(text, { min, max, lo, hi }),
  random: () => randomArray(n, Math.max(lo, 0), hi).join(', '),
});

function searchInput(def) {
  return {
    default: def,
    hint: L('첫 줄: 정수 목록, 둘째 줄: target: 찾을 값 (정렬해서 탐색)', 'Line 1: integers, line 2: target (the list is sorted first)'),
    parse(text) {
      const { keys, rest } = parseKeyed(text);
      const values = parseNumbers(rest.join(' '), { min: 1, max: 40 }).sort((x, y) => x - y);
      return { values, target: parseInteger(keys.target, 'target', -999, 999) };
    },
    random() {
      const values = randomArray(randInt(8, 14), 1, 80).sort((x, y) => x - y);
      return `${values.join(', ')}\ntarget: ${values[randInt(0, values.length - 1)]}`;
    },
  };
}

const show = (a, extra = {}) => arrayView(a, extra);

function finishSorted(r, a, line) {
  r.step(line, L(`정렬 완료: ${a.join(', ')}`, `Sorted: ${a.join(', ')}`), show(a, { done: a.map((_, i) => i) }), {});
}

export const cocktailSort = {
  id: 'cocktail-sort', category: 'sorting', view: 'array',
  name: L('칵테일 정렬', 'Cocktail Sort'),
  summary: L('버블 정렬을 앞에서 뒤로, 뒤에서 앞으로 번갈아 진행합니다.', 'Bubble sort that alternates forward and backward passes.'),
  description: L(
    '칵테일(셰이커) 정렬은 버블 정렬의 변형입니다. 한 번은 왼쪽에서 오른쪽으로 큰 값을 보내고, 다음 번은 오른쪽에서 왼쪽으로 작은 값을 보냅니다.\n\n양 끝의 값이 번갈아 자리를 잡으므로, 작은 값이 맨 앞에 있는 입력에서 버블 정렬보다 빨리 끝납니다.',
    'Cocktail (shaker) sort is bubble sort that alternates direction: one pass moves the largest value to the right, the next moves the smallest value to the left.\n\nBoth ends settle in turn, so a tiny value at the end does not have to crawl all the way across.'),
  complexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('안정 정렬 · 제자리 정렬', 'Stable · In-place'),
  input: numbers('5, 1, 4, 2, 8, 0, 2', { lo: 0 }),
  pseudo: ['procedure cocktailSort(A)', '  start ← 0; end ← n − 1', '  while swapped', '    sweep forward; end ← end − 1', '    sweep backward; start ← start + 1'],
  run(input) {
    const a = [...input];
    return record((r) => {
      let start = 0; let end = a.length - 1; let swapped = true;
      r.step(0, L('양방향으로 이웃을 비교합니다.', 'Compare neighbours in both directions.'), show(a), {});
      while (swapped) {
        swapped = false;
        for (let i = start; i < end; i++) {
          r.step(3, L(`앞으로: A[${i}]=${a[i]}, A[${i + 1}]=${a[i + 1]}`, `Forward: A[${i}]=${a[i]}, A[${i + 1}]=${a[i + 1]}`), show(a, { colors: { [i]: 'compare', [i + 1]: 'compare' } }), { i });
          if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; }
        }
        end -= 1;
        if (!swapped) break;
        swapped = false;
        for (let i = end - 1; i >= start; i--) {
          r.step(4, L(`뒤로: A[${i}]=${a[i]}, A[${i + 1}]=${a[i + 1]}`, `Backward: A[${i}]=${a[i]}, A[${i + 1}]=${a[i + 1]}`), show(a, { colors: { [i]: 'compare', [i + 1]: 'compare' } }), { i });
          if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; }
        }
        start += 1;
      }
      finishSorted(r, a, 4);
    });
  },
};

export const combSort = {
  id: 'comb-sort', category: 'sorting', view: 'array',
  name: L('콤 정렬', 'Comb Sort'),
  summary: L('간격을 1.3으로 나눠 가며 멀리 떨어진 값을 바꿉니다.', 'Shrinks the gap by 1.3 and swaps distant values.'),
  description: L(
    '콤 정렬은 버블 정렬의 간격(gap)을 크게 시작했다가 1.3으로 나눠 줄입니다. 멀리 있는 거북이 값(작은 값이 뒤에 있는 경우)을 빨리 앞으로 보냅니다.\n\n간격이 1이 되면 버블 정렬과 같고, 그때 교환이 없으면 끝입니다.',
    'Comb sort starts with a large gap and divides it by 1.3. Distant swaps pull small "turtles" forward much faster than adjacent swaps.\n\nWhen the gap is 1 it is bubble sort, and it stops when that pass swaps nothing.'),
  complexity: { best: 'O(n log n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('제자리 정렬', 'In-place'),
  input: numbers('8, 4, 1, 56, 3, 44, 23, 6, 28, 0', { lo: 0 }),
  pseudo: ['procedure combSort(A)', '  gap ← n', '  while gap > 1 or swapped', '    gap ← max(1, floor(gap / 1.3))', '    compare A[i] and A[i + gap]'],
  run(input) {
    const a = [...input];
    return record((r) => {
      let gap = a.length; let swapped = true;
      r.step(0, L('큰 간격부터 줄여 갑니다.', 'Start with a large gap and shrink it.'), show(a), { gap });
      while (gap > 1 || swapped) {
        gap = Math.max(1, Math.floor(gap / 1.3));
        swapped = false;
        r.step(3, L(`간격 ${gap}`, `Gap ${gap}`), show(a), { gap });
        for (let i = 0; i + gap < a.length; i++) {
          const out = a[i] > a[i + gap];
          r.step(4, L(`간격 ${gap}: A[${i}]=${a[i]} ${out ? '>' : '≤'} A[${i + gap}]=${a[i + gap]}`, `Gap ${gap}: A[${i}]=${a[i]} ${out ? '>' : '≤'} A[${i + gap}]=${a[i + gap]}`), show(a, { colors: { [i]: 'compare', [i + gap]: 'compare' } }), { i, gap });
          if (out) {
            [a[i], a[i + gap]] = [a[i + gap], a[i]];
            swapped = true;
            r.step(4, L(`A[${i}] 와 A[${i + gap}] 교환`, `Swap A[${i}] and A[${i + gap}]`), show(a, { colors: { [i]: 'swap', [i + gap]: 'swap' } }), { i, gap });
          }
        }
        if (gap === 1 && !swapped) break;
      }
      finishSorted(r, a, 4);
    });
  },
};

export const gnomeSort = {
  id: 'gnome-sort', category: 'sorting', view: 'array',
  name: L('그놈 정렬', 'Gnome Sort'),
  summary: L('화분이 잘못된 자리면 한 칸 앞으로 돌려놓고 다시 봅니다.', 'Steps back one pot when it is out of order, then forward again.'),
  description: L(
    '그놈 정렬은 정원사가 화분을 보다가 순서가 틀리면 바로 앞 화분과 바꾸고 한 칸 되돌아가는 방식입니다. 맞으면 한 칸 앞으로 갑니다.\n\n삽입 정렬과 교환 횟수가 같고, 구현은 더 짧습니다.',
    'Gnome sort is a gardener who swaps a pot with the one before it when they are out of order, then steps back. When they are in order, the gardener steps forward.\n\nIt makes the same swaps as insertion sort, with a shorter program.'),
  complexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('안정 정렬 · 제자리 정렬', 'Stable · In-place'),
  input: numbers('5, 3, 4, 1, 2, 6'),
  pseudo: ['procedure gnomeSort(A)', '  i ← 0', '  if i = 0 or A[i] ≥ A[i − 1]: i ← i + 1', '  else swap and i ← i − 1'],
  run(input) {
    const a = [...input];
    return record((r) => {
      let i = 0;
      r.step(0, L('앞에서부터 한 칸씩 확인합니다.', 'Check one pot at a time.'), show(a, { pointers: { i } }), { i });
      while (i < a.length) {
        if (i === 0 || a[i] >= a[i - 1]) {
          r.step(2, L(`A[${i}]=${a[i]} 순서가 맞습니다.`, `A[${i}]=${a[i]} is in order.`), show(a, { colors: { [i]: 'active' }, pointers: { i } }), { i });
          i += 1;
        } else {
          [a[i], a[i - 1]] = [a[i - 1], a[i]];
          r.step(3, L(`순서가 틀려 A[${i - 1}]와 바꾸고 되돌아갑니다.`, 'Out of order: swap and step back.'), show(a, { colors: { [i]: 'swap', [i - 1]: 'swap' } }), { i });
          i -= 1;
        }
      }
      finishSorted(r, a, 3);
    });
  },
};

export const oddEvenSort = {
  id: 'odd-even-sort', category: 'sorting', view: 'array',
  name: L('홀짝 정렬', 'Odd–Even Sort'),
  summary: L('홀수 칸과 짝수 칸의 이웃을 번갈아 비교합니다.', 'Alternates odd and even adjacent pairs.'),
  description: L(
    '홀짝 정렬은 짝수 인덱스 쌍 (0,1), (2,3), … 을 비교·교환한 뒤 홀수 인덱스 쌍 (1,2), (3,4), … 을 비교합니다. 교환이 없을 때까지 반복합니다.\n\n각 단계의 비교가 서로 겹치지 않아 병렬로 처리하기 좋습니다.',
    'Odd–even sort compares the even pairs (0,1), (2,3), … and then the odd pairs (1,2), (3,4), …. It repeats until a round swaps nothing.\n\nPairs in one phase do not overlap, so they can be compared in parallel.'),
  complexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('안정 정렬 · 병렬 비교', 'Stable · Parallel compares'),
  input: numbers('9, 7, 8, 3, 1, 5, 4, 2'),
  pseudo: ['procedure oddEvenSort(A)', '  repeat', '    compare even pairs (0,1), (2,3), …', '    compare odd pairs (1,2), (3,4), …', '  until a round swaps nothing'],
  run(input) {
    const a = [...input];
    return record((r) => {
      let swapped = true; let phase = 0;
      r.step(0, L('짝수 쌍과 홀수 쌍을 번갈아 봅니다.', 'Alternate even pairs and odd pairs.'), show(a), {});
      while (swapped) {
        swapped = false;
        const begin = phase % 2;
        for (let i = begin; i + 1 < a.length; i += 2) {
          r.step(begin ? 3 : 2, L(`쌍 (${i}, ${i + 1}): ${a[i]}, ${a[i + 1]}`, `Pair (${i}, ${i + 1}): ${a[i]}, ${a[i + 1]}`), show(a, { colors: { [i]: 'compare', [i + 1]: 'compare' } }), { i });
          if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; swapped = true; }
        }
        phase += 1;
      }
      finishSorted(r, a, 4);
    });
  },
};

export const countingSort = {
  id: 'counting-sort', category: 'sorting', view: 'array',
  name: L('계수 정렬', 'Counting Sort'),
  summary: L('값마다 나온 횟수를 세고, 그 횟수만큼 다시 씁니다.', 'Counts how often each value appears, then writes them back.'),
  description: L(
    '계수 정렬은 비교하지 않습니다. 값 v가 몇 번 나왔는지 count[v]에 세고, 0부터 큰 값까지 그 횟수만큼 배열에 다시 씁니다.\n\n값의 범위가 작을 때 O(n + k)입니다. 여기서 k는 최댓값입니다. 음수는 받지 않습니다.',
    'Counting sort does not compare. It counts how often each value v appears, then writes the values back from 0 upward.\n\nIt is O(n + k) when the range k is small. This version takes non-negative integers.'),
  complexity: { best: 'O(n + k)', average: 'O(n + k)', worst: 'O(n + k)', space: 'O(n + k)' },
  traits: L('안정 정렬 · 비교하지 않음', 'Stable · Not comparison-based'),
  input: numbers('4, 2, 2, 8, 3, 3, 1, 0, 7', { lo: 0, hi: 20, n: 12 }),
  pseudo: ['procedure countingSort(A)', '  count[v] ← how many times v appears', '  i ← 0', '  for v ← 0 to max', '    write v, count[v] times'],
  run(input) {
    const a = [...input];
    return record((r) => {
      const max = Math.max(...a);
      const count = Array(max + 1).fill(0);
      const counts = (colors = {}) => ({ label: 'count', values: count.map(String), colors, span: true });
      r.step(0, L('각 값이 몇 번 나오는지 셉니다.', 'Count how often each value appears.'), show(a, { aux: counts() }), { max });
      a.forEach((v, i) => {
        count[v] += 1;
        r.step(1, L(`A[${i}]=${v} → count[${v}] = ${count[v]}`, `A[${i}]=${v} → count[${v}] = ${count[v]}`), show(a, { colors: { [i]: 'active' }, aux: counts({ [v]: 'write' }) }), { i, v });
      });
      let i = 0;
      for (let v = 0; v <= max; v++) {
        if (!count[v]) continue;
        for (let c = 0; c < count[v]; c++) {
          a[i] = v;
          r.step(4, L(`${v} 을(를) A[${i}]에 씁니다. (${c + 1}/${count[v]})`, `Write ${v} at A[${i}] (${c + 1}/${count[v]}).`), show(a, { colors: { [i]: 'write' }, aux: counts({ [v]: 'source' }) }), { v, i });
          i += 1;
        }
      }
      finishSorted(r, a, 4);
    });
  },
};

export const pancakeSort = {
  id: 'pancake-sort', category: 'sorting', view: 'array',
  name: L('팬케이크 정렬', 'Pancake Sort'),
  summary: L('접시 위의 팬케이크처럼 앞부분을 뒤집어서 정렬합니다.', 'Sorts by flipping prefixes, like a stack of pancakes.'),
  description: L(
    '뒤집기만 허용된 정렬입니다. 아직 정리되지 않은 구간에서 가장 큰 값을 찾아 맨 앞으로 뒤집은 다음, 그 구간 전체를 뒤집어 맨 뒤로 보냅니다.\n\n뒤집기 한 번이 여러 원소를 움직이므로, 교환 정렬과는 움직임이 다릅니다.',
    'Only prefix flips are allowed. Find the largest unsorted value, flip it to the front, then flip the whole unsorted prefix so it lands at the end.\n\nOne flip moves many elements, unlike a single swap.'),
  complexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('뒤집기만 사용', 'Prefix reversals only'),
  input: numbers('3, 6, 1, 5, 2, 4'),
  pseudo: ['procedure pancakeSort(A)', '  for size ← n down to 2', '    m ← index of the max in A[0..size)', '    flip the prefix ending at m', '    flip the prefix of length size'],
  run(input) {
    const a = [...input];
    const flip = (k) => { for (let i = 0, j = k - 1; i < j; i++, j--) [a[i], a[j]] = [a[j], a[i]]; };
    return record((r) => {
      r.step(0, L('앞부분을 뒤집어서 큰 값을 뒤로 보냅니다.', 'Flip prefixes to move the largest value back.'), show(a), {});
      for (let size = a.length; size > 1; size--) {
        let m = 0;
        for (let i = 1; i < size; i++) if (a[i] > a[m]) m = i;
        r.step(2, L(`앞 ${size}개 중 최댓값 A[${m}]=${a[m]}`, `Max of the first ${size} is A[${m}]=${a[m]}`), show(a, { colors: { [m]: 'active' }, range: [0, size - 1] }), { m, size });
        if (m !== size - 1) {
          if (m !== 0) { flip(m + 1); r.step(3, L(`${m + 1}개까지 뒤집습니다.`, `Flip the first ${m + 1}.`), show(a, { range: [0, m] }), {}); }
          flip(size);
          r.step(4, L(`${size}개까지 뒤집어 ${a[size - 1]} 을(를) 확정합니다.`, `Flip ${size} and settle ${a[size - 1]}.`), show(a, { colors: { [size - 1]: 'done' } }), { size });
        }
      }
      finishSorted(r, a, 4);
    });
  },
};

export const dutchFlag = {
  id: 'dutch-flag', category: 'sorting', view: 'array',
  name: L('네덜란드 국기 문제', 'Dutch National Flag'),
  summary: L('0, 1, 2 를 한 번의 훑기로 세 묶음으로 나눕니다.', 'Partitions 0, 1 and 2 in one pass.'),
  description: L(
    '데이크스트라의 네덜란드 국기 문제입니다. 0은 왼쪽, 2는 오른쪽, 1은 가운데에 모읍니다. 포인터 lo, mid, hi 세 개로 배열을 한 번만 훑습니다.\n\n퀵 정렬의 3분할 분할과 같은 생각입니다.',
    "Dijkstra's Dutch national flag problem. Zeros go left, twos go right and ones stay in the middle, using three pointers in one pass.\n\nIt is the same idea as 3-way quicksort partitioning."),
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' },
  traits: L('제자리 · 한 번 훑기', 'In-place · One pass'),
  input: numbers('2, 0, 2, 1, 1, 0, 2, 1, 0, 0', { lo: 0, hi: 2, n: 12 }),
  pseudo: ['procedure dutchFlag(A)', '  lo, mid ← 0; hi ← n − 1', '  while mid ≤ hi', '    0: swap with lo and advance both', '    2: swap with hi and retreat hi', '    1: advance mid'],
  run(input) {
    const a = [...input];
    return record((r) => {
      let lo = 0; let mid = 0; let hi = a.length - 1;
      r.step(1, L('0은 왼쪽, 2는 오른쪽, 1은 가운데입니다.', 'Zeros left, twos right, ones in the middle.'), show(a, { pointers: { lo, mid, hi } }), { lo, mid, hi });
      while (mid <= hi) {
        r.step(2, L(`A[${mid}]=${a[mid]}`, `A[${mid}]=${a[mid]}`), show(a, { colors: { [mid]: 'compare', [lo]: 'active', [hi]: 'pivot' }, pointers: { lo, mid, hi } }), { lo, mid, hi });
        if (a[mid] === 0) { [a[lo], a[mid]] = [a[mid], a[lo]]; lo += 1; mid += 1; }
        else if (a[mid] === 2) { [a[mid], a[hi]] = [a[hi], a[mid]]; hi -= 1; }
        else mid += 1;
      }
      finishSorted(r, a, 5);
    });
  },
};

function searchRun(lineOf, step) {
  return ({ values: a, target }) => record((r) => {
    r.step(0, L(`${target} 을(를) 정렬된 배열에서 찾습니다.`, `Search the sorted array for ${target}.`), show(a), { target });
    const found = step(a, target, (msg, colors, vars) => r.step(lineOf, msg, show(a, { colors }), vars));
    r.step(lineOf, found < 0 ? L('없습니다.', 'Not found.') : L(`인덱스 ${found}`, `Index ${found}`), show(a, { colors: found < 0 ? {} : { [found]: 'found' } }), { result: found });
  });
}

export const jumpSearch = {
  id: 'jump-search', category: 'searching', view: 'array',
  name: L('점프 탐색', 'Jump Search'),
  summary: L('√n 칸씩 뛰어 넘은 뒤, 그 구간을 차례로 봅니다.', 'Jumps by √n, then scans that block.'),
  description: L(
    '정렬된 배열에서 √n 칸씩 점프합니다. 점프한 값이 target보다 커지면 바로 이전 블록을 선형 탐색합니다.\n\n비교 횟수는 O(√n)으로, 선형 탐색과 이진 탐색 사이입니다.',
    'On a sorted array, jump √n steps. When a jumped value passes the target, scan the previous block linearly.\n\nIt uses O(√n) comparisons, between linear search and binary search.'),
  complexity: { best: 'O(1)', average: 'O(√n)', worst: 'O(√n)', space: 'O(1)' },
  traits: L('정렬된 입력 · 블록 탐색', 'Sorted input · Block search'),
  input: searchInput('0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89\ntarget: 55'),
  pseudo: ['procedure jumpSearch(A, target)', '  step ← floor(√n)', '  jump while A[end] < target', '  scan the previous block'],
  run: searchRun(3, (a, target, note) => {
    const step = Math.max(1, Math.floor(Math.sqrt(a.length)));
    let prev = 0; let end = step;
    while (prev < a.length && a[Math.min(end, a.length) - 1] < target) {
      note(L(`${step}칸 점프, A[${Math.min(end, a.length) - 1}] < ${target}`, `Jump ${step}, still below ${target}`), { [Math.min(end, a.length) - 1]: 'compare' }, { step });
      prev = end; end += step;
    }
    for (let i = prev; i < Math.min(end, a.length); i++) {
      note(L(`A[${i}]=${a[i]}`, `A[${i}]=${a[i]}`), { [i]: 'compare' }, { i });
      if (a[i] === target) return i;
      if (a[i] > target) return -1;
    }
    return -1;
  }),
};

export const interpolationSearch = {
  id: 'interpolation-search', category: 'searching', view: 'array',
  name: L('보간 탐색', 'Interpolation Search'),
  summary: L('값이 고르게 퍼져 있다고 보고 예상 위치를 계산합니다.', 'Estimates the index as if the values were evenly spread.'),
  description: L(
    '이진 탐색은 항상 가운데를 봅니다. 보간 탐색은 전화번호부에서 이름이 S이면 뒤쪽을 펴듯, target이 lo와 hi 사이 어디쯤인지 비례식으로 위치를 잡습니다.\n\n값이 균등하면 평균 O(log log n)이고, 한쪽으로 몰리면 느려질 수 있습니다.',
    'Binary search always looks at the middle. Interpolation search estimates where the target should sit between lo and hi, the way you open a phone book near S.\n\nOn uniform data the average is O(log log n). Skewed data can be slower.'),
  complexity: { best: 'O(1)', average: 'O(log log n)', worst: 'O(n)', space: 'O(1)' },
  traits: L('정렬 · 균등 분포에 유리', 'Sorted · Best on uniform data'),
  input: searchInput('10, 20, 30, 40, 50, 60, 70, 80, 90\ntarget: 70'),
  pseudo: ['procedure interpolationSearch(A, target)', '  pos ← lo + (target − A[lo]) × (hi − lo) / (A[hi] − A[lo])', '  if A[pos] = target: return pos', '  else shrink lo or hi'],
  run: searchRun(2, (a, target, note) => {
    let lo = 0; let hi = a.length - 1;
    while (lo <= hi && target >= a[lo] && target <= a[hi]) {
      if (a[hi] === a[lo]) return a[lo] === target ? lo : -1;
      const pos = lo + Math.floor(((target - a[lo]) * (hi - lo)) / (a[hi] - a[lo]));
      note(L(`예상 위치 ${pos}, A[${pos}]=${a[pos]}`, `Probe ${pos}, A[${pos}]=${a[pos]}`), { [pos]: 'compare', [lo]: 'active', [hi]: 'pivot' }, { pos, lo, hi });
      if (a[pos] === target) return pos;
      if (a[pos] < target) lo = pos + 1; else hi = pos - 1;
    }
    return -1;
  }),
};

export const exponentialSearch = {
  id: 'exponential-search', category: 'searching', view: 'array',
  name: L('지수 탐색', 'Exponential Search'),
  summary: L('1, 2, 4, 8… 칸으로 범위를 잡은 뒤 이진 탐색합니다.', 'Finds a range by doubling, then binary-searches it.'),
  description: L(
    '정렬된 배열(또는 무한에 가까운 배열)에서 인덱스를 1, 2, 4, 8… 로 늘리다가 target 이상인 값을 만나면, 그 직전 구간만 이진 탐색합니다.\n\ntarget이 앞에 있으면 전체를 보지 않습니다.',
    'On a sorted array, probe indices 1, 2, 4, 8… until a value is at least the target, then binary-search only that range.\n\nA target near the front does not look at the rest of the array.'),
  complexity: { best: 'O(1)', average: 'O(log i)', worst: 'O(log n)', space: 'O(1)' },
  traits: L('정렬 · 범위 제한 이진 탐색', 'Sorted · Bounded binary search'),
  input: searchInput('2, 3, 4, 10, 40, 50, 60, 70, 80, 90\ntarget: 10'),
  pseudo: ['procedure exponentialSearch(A, target)', '  bound ← 1', '  while bound < n and A[bound] < target: bound ← bound × 2', '  binary search between bound/2 and min(bound, n − 1)'],
  run: searchRun(3, (a, target, note) => {
    if (a[0] === target) return 0;
    let bound = 1;
    while (bound < a.length && a[bound] < target) {
      note(L(`A[${bound}]=${a[bound]} < ${target}, 범위를 두 배로`, `A[${bound}]=${a[bound]} < ${target}, double the bound`), { [bound]: 'compare' }, { bound });
      bound *= 2;
    }
    let lo = Math.floor(bound / 2); let hi = Math.min(bound, a.length - 1);
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      note(L(`이진 탐색 mid=${mid}, A[mid]=${a[mid]}`, `Binary search mid=${mid}, A[mid]=${a[mid]}`), { [mid]: 'compare' }, { lo, mid, hi });
      if (a[mid] === target) return mid;
      if (a[mid] < target) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }),
};

export const quickselect = {
  id: 'quickselect', category: 'searching', view: 'array',
  name: L('퀵 셀렉트', 'Quickselect'),
  summary: L('정렬하지 않고 k번째로 작은 값만 찾습니다.', 'Finds the k-th smallest value without sorting.'),
  description: L(
    '퀵 정렬의 분할을 한쪽만 계속합니다. 피벗이 놓인 자리가 찾고 있는 순서면 그 값이 답이고, 아니면 왼쪽이나 오른쪽만 다시 분할합니다.\n\n평균 O(n)에 k번째 값을 구합니다. k는 1부터 셉니다.',
    'Quickselect keeps only one side of quicksort\'s partition. If the pivot lands on the rank you want, that value is the answer; otherwise only the left or the right side continues.\n\nThe average is O(n). k is 1-based.'),
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('선택 알고리즘 · 제자리', 'Selection · In-place'),
  input: {
    default: '7, 10, 4, 3, 20, 15\nk: 3',
    hint: L('첫 줄: 정수, 둘째 줄: k: 몇 번째로 작은 값 (1부터)', 'Line 1: integers, line 2: k: 1-based rank'),
    parse(text) {
      const { keys, rest } = parseKeyed(text);
      const values = parseNumbers(rest.join(' '), { min: 1, max: 40 });
      const k = parseInteger(keys.k, 'k', 1, values.length);
      return { values, k };
    },
    random() {
      const values = randomArray(randInt(6, 12), 1, 50);
      return `${values.join(', ')}\nk: ${randInt(1, values.length)}`;
    },
  },
  pseudo: ['procedure quickselect(A, k)', '  partition around a pivot', '  if pivot index = k − 1: return A[pivot]', '  else search only the side that contains k'],
  run({ values, k }) {
    const a = [...values];
    return record((r) => {
      let lo = 0; let hi = a.length - 1; const want = k - 1;
      r.step(0, L(`${k}번째로 작은 값을 찾습니다.`, `Find the ${k}-th smallest.`), show(a), { k });
      while (lo <= hi) {
        const pivot = a[hi]; let i = lo;
        r.step(1, L(`[${lo}..${hi}] 피벗 = ${pivot}`, `Partition [${lo}..${hi}], pivot = ${pivot}`), show(a, { colors: { [hi]: 'pivot' }, range: [lo, hi], pointers: { i } }), { lo, hi, k });
        for (let j = lo; j < hi; j++) {
          r.step(1, L(`A[${j}]=${a[j]} < 피벗 ${pivot} ?`, `Is A[${j}]=${a[j]} < pivot ${pivot}?`), show(a, { colors: { [hi]: 'pivot', [j]: 'compare' }, range: [lo, hi], pointers: { i, j } }), { j, k });
          if (a[j] < pivot) {
            [a[i], a[j]] = [a[j], a[i]];
            r.step(1, L(`A[${i}] 와 A[${j}] 교환`, `Swap A[${i}] and A[${j}]`), show(a, { colors: { [hi]: 'pivot', [i]: 'swap', [j]: 'swap' }, range: [lo, hi] }), { i, j });
            i += 1;
          }
        }
        [a[i], a[hi]] = [a[hi], a[i]];
        r.step(1, L(`피벗 ${a[i]} 이(가) 인덱스 ${i}에 놓였습니다.`, `Pivot ${a[i]} landed at index ${i}.`), show(a, { colors: { [i]: 'pivot' }, range: [lo, hi] }), { i, k });
        if (i === want) {
          r.step(2, L(`${k}번째 값은 ${a[i]}입니다.`, `The ${k}-th value is ${a[i]}.`), show(a, { colors: { [i]: 'found' } }), { result: a[i] });
          return;
        }
        if (i < want) lo = i + 1; else hi = i - 1;
        r.step(3, L(i < want ? '오른쪽으로 계속' : '왼쪽으로 계속', i < want ? 'Continue on the right' : 'Continue on the left'), show(a, { range: [lo, hi] }), { lo, hi });
      }
    });
  },
};

export const kadane = {
  id: 'kadane', category: 'dp', view: 'array',
  name: L('카데인 알고리즘', "Kadane's Algorithm"),
  summary: L('연속된 부분 배열의 합이 최대가 되는 구간을 찾습니다.', 'Finds the contiguous subarray with the largest sum.'),
  description: L(
    '지금까지의 합이 음수면 버리고, 아니면 이어 붙입니다. 그 과정에서 본 합의 최댓값이 답입니다.\n\n모든 구간을 보는 O(n²) 대신 O(n)에 최대 부분합을 구합니다.',
    'If the sum so far is negative, drop it; otherwise extend it. The largest sum seen along the way is the answer.\n\nThat finds the maximum subarray in O(n) instead of checking every range.'),
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' },
  traits: L('동적 계획법 · 한 번 훑기', 'Dynamic programming · One pass'),
  input: numbers('-2, 1, -3, 4, -1, 2, 1, -5, 4', { lo: -50, hi: 50, n: 10 }),
  pseudo: ['procedure kadane(A)', '  best ← A[0]; cur ← 0', '  for each x', '    cur ← max(x, cur + x)', '    best ← max(best, cur)'],
  run(input) {
    const a = [...input];
    return record((r) => {
      let best = a[0]; let cur = 0; let start = 0; let at = 0; let from = 0;
      r.step(1, L('음수가 된 합은 버리고 다시 시작합니다.', 'A negative running sum is dropped.'), show(a), { best });
      for (let i = 0; i < a.length; i++) {
        if (cur + a[i] < a[i]) { cur = a[i]; from = i; } else cur += a[i];
        if (cur > best) { best = cur; start = from; at = i; }
        const colors = {};
        for (let k = start; k <= at; k++) colors[k] = 'path';
        colors[i] = 'current';
        r.step(3, L(`i=${i}, 현재 합 ${cur}, 최댓값 ${best}`, `i=${i}, running ${cur}, best ${best}`), show(a, { colors }), { i, cur, best });
      }
      r.step(4, L(`최대 부분합은 ${best}입니다.`, `The maximum subarray sum is ${best}.`), show(a, { colors: Object.fromEntries(Array.from({ length: at - start + 1 }, (_, k) => [start + k, 'found'])) }), { result: best });
    });
  },
};

export const coinChange = {
  id: 'coin-change', category: 'dp', view: 'table',
  name: L('동전 거스름돈', 'Coin Change'),
  summary: L('금액을 만드는 동전의 최소 개수를 표로 채웁니다.', 'Fills a table with the fewest coins for each amount.'),
  description: L(
    'dp[x]는 금액 x를 만드는 최소 동전 수입니다. 동전 c를 하나 더 쓰는 경우 dp[x − c] + 1과 지금까지의 dp[x] 중 작은 값을 고릅니다.\n\n만들 수 없으면 표를 비워 두고, 답은 dp[amount]입니다.',
    'dp[x] is the fewest coins that make amount x. Using one more coin c, take the smaller of dp[x] and dp[x − c] + 1.\n\nAmounts that cannot be made stay empty. The answer is dp[amount].'),
  complexity: { best: 'O(n·amount)', average: 'O(n·amount)', worst: 'O(n·amount)', space: 'O(amount)' },
  traits: L('동적 계획법 · 무제한 배낭', 'Dynamic programming · Unbounded knapsack'),
  input: {
    default: 'coins: 1, 3, 4\namount: 6',
    hint: L('coins: 동전 종류 (1~8개), amount: 금액 (1~30)', 'coins: 1–8 denominations, amount: 1–30'),
    parse(text) {
      const { keys } = parseKeyed(text);
      const coins = parseNumbers(keys.coins ?? '', { min: 1, max: 8, lo: 1, hi: 30 });
      const amount = parseInteger(keys.amount, 'amount', 1, 30);
      return { coins: [...new Set(coins)].sort((x, y) => x - y), amount };
    },
    random: () => `coins: 1, ${randInt(2, 5)}, ${randInt(6, 10)}\namount: ${randInt(8, 24)}`,
  },
  pseudo: ['procedure coinChange(coins, amount)', '  dp[0] ← 0; dp[x] ← ∞', '  for each coin c', '    for x ← c to amount', '      dp[x] ← min(dp[x], dp[x − c] + 1)'],
  run({ coins, amount }) {
    return record((r) => {
      const dp = Array(amount + 1).fill(null);
      dp[0] = 0;
      const cells = () => [dp.map((v) => (v === null ? '∞' : String(v)))];
      const view = (colors = {}) => tableView({ colHeaders: dp.map((_, i) => String(i)), rowHeaders: ['dp'], cells: cells(), colors });
      r.step(1, L('금액 0은 동전 0개입니다.', 'Amount 0 takes no coins.'), view({ '0,0': 'write' }), { amount });
      for (const c of coins) {
        for (let x = c; x <= amount; x++) {
          if (dp[x - c] === null) continue;
          const next = dp[x - c] + 1;
          if (dp[x] === null || next < dp[x]) {
            dp[x] = next;
            r.step(4, L(`동전 ${c}: dp[${x}] ← ${next}`, `Coin ${c}: dp[${x}] ← ${next}`), view({ [`0,${x}`]: 'write', [`0,${x - c}`]: 'source' }), { c, x });
          }
        }
      }
      const result = dp[amount] === null ? -1 : dp[amount];
      r.step(4, L(result < 0 ? '만들 수 없습니다.' : `최소 ${result}개입니다.`, result < 0 ? 'Impossible.' : `Fewest coins: ${result}.`), view({ [`0,${amount}`]: 'found' }), { result });
    });
  },
};

export const lis = {
  id: 'lis', category: 'dp', view: 'array',
  name: L('최장 증가 부분 수열', 'Longest Increasing Subsequence'),
  summary: L('순서를 지키며 고를 수 있는 가장 긴 증가 수열의 길이를 구합니다.', 'The longest subsequence that strictly increases.'),
  description: L(
    '부분 수열은 연속일 필요가 없고 순서만 지키면 됩니다. length[i]는 A[i]로 끝나는 최장 증가 수열의 길이입니다.\n\n앞의 더 작은 값들 중 가장 긴 것에 1을 더합니다. 답은 length의 최댓값입니다. 이 표 채우기는 O(n²)입니다.',
    'A subsequence need not be contiguous, only ordered. length[i] is the longest increasing subsequence that ends at A[i].\n\nIt is one more than the best smaller value before it. The answer is the maximum length. Filling the table is O(n²).'),
  complexity: { best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(n)' },
  traits: L('동적 계획법', 'Dynamic programming'),
  input: numbers('10, 22, 9, 33, 21, 50, 41, 60', { lo: 1, hi: 80, n: 8 }),
  pseudo: ['procedure LIS(A)', '  length[i] ← 1', '  for i ← 1 to n − 1', '    for j ← 0 to i − 1', '      if A[j] < A[i]: length[i] ← max(length[i], length[j] + 1)'],
  run(input) {
    const a = [...input];
    return record((r) => {
      const length = Array(a.length).fill(1);
      const prev = Array(a.length).fill(-1);
      const lens = (colors = {}) => ({ label: 'len', values: length.map(String), colors });
      r.step(1, L('각 위치로 끝나는 길이를 1로 둡니다.', 'Every element is an increasing subsequence of length 1.'), show(a, { aux: lens() }), {});
      for (let i = 1; i < a.length; i++) {
        for (let j = 0; j < i; j++) {
          const can = a[j] < a[i];
          const better = can && length[j] + 1 > length[i];
          r.step(3, L(`A[${j}]=${a[j]} ${can ? '<' : '≥'} A[${i}]=${a[i]}${better ? `, 길이 ${length[j] + 1}` : ''}`, `A[${j}]=${a[j]} ${can ? '<' : '≥'} A[${i}]=${a[i]}${better ? `, length ${length[j] + 1}` : ''}`), show(a, { colors: { [i]: 'active', [j]: 'compare' }, aux: lens({ [i]: 'active', [j]: 'compare' }) }), { i, j });
          if (better) {
            length[i] = length[j] + 1;
            prev[i] = j;
            r.step(4, L(`A[${i}]로 끝나는 길이 ← ${length[i]}`, `Length ending at A[${i}] ← ${length[i]}`), show(a, { colors: { [i]: 'write', [j]: 'source' }, aux: lens({ [i]: 'write', [j]: 'source' }) }), { i, length: length[i] });
          }
        }
      }
      const best = Math.max(...length);
      let at = length.indexOf(best);
      const chain = [];
      while (at >= 0) { chain.push(at); at = prev[at]; }
      const order = chain.reverse();
      const colors = Object.fromEntries(a.map((_, i) => [i, order.includes(i) ? 'found' : 'dim']));
      const auxColors = Object.fromEntries(order.map((i) => [i, 'found']));
      const seq = order.map((i) => a[i]).join(' → ');
      r.step(4, L(`최장 길이는 ${best}입니다. 수열 ${seq}`, `The longest length is ${best}. One subsequence: ${seq}`), show(a, { colors, aux: lens(auxColors) }), { result: best });
    });
  },
};

export const activitySelection = {
  id: 'activity-selection', category: 'greedy', view: 'intervals',
  name: L('활동 선택', 'Activity Selection'),
  summary: L('겹치지 않게 고를 수 있는 활동의 최대 개수입니다.', 'The most activities that do not overlap.'),
  description: L(
    '각 활동은 시작 시각과 끝나는 시각이 있습니다. 끝나는 시각이 빠른 것부터 고르고, 이미 고른 활동이 끝난 뒤에 시작하는 것만 추가합니다.\n\n이 그리디 선택이 겹치지 않는 활동의 최대 개수를 만듭니다. 한 줄에 "시작 끝"을 적습니다.',
    'Each activity has a start and a finish. Sort by finishing time and take an activity when it starts after the last one you took.\n\nThat greedy choice gives the largest set of non-overlapping activities. Write one "start finish" pair per line.'),
  complexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)' },
  traits: L('그리디 · 구간 스케줄링', 'Greedy · Interval scheduling'),
  input: {
    default: '1 4\n3 5\n0 6\n5 7\n8 9\n5 9',
    hint: L('한 줄에 시작과 끝 (1~12개, 끝 > 시작)', 'One start and finish per line (1–12, finish > start)'),
    parse(text) {
      const rows = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (rows.length < 1 || rows.length > 12) throw new InputError('활동을 1~12개 입력하세요.', 'Enter 1–12 activities.');
      return rows.map((line) => {
        const [s, f] = line.split(/[\s,]+/).map(Number);
        if (!Number.isInteger(s) || !Number.isInteger(f) || f <= s || s < 0 || f > 100) throw new InputError('시작과 끝을 정수로, 끝이 더 커야 합니다.', 'Finish must be an integer greater than start.');
        return { s, f };
      });
    },
    random() {
      const n = randInt(4, 8);
      return Array.from({ length: n }, () => { const s = randInt(0, 12); return `${s} ${s + randInt(1, 4)}`; }).join('\n');
    },
  },
  pseudo: ['procedure activitySelection(activities)', '  sort by finishing time', '  take the first', '  take the next that starts after the last finish'],
  run(input) {
    const items = [...input].sort((a, b) => a.f - b.f || a.s - b.s);
    return record((r) => {
      const state = items.map(() => 'wait');
      const view = (focus = -1, mark = null) => ({
        kind: 'intervals',
        mark,
        items: items.map((a, i) => ({ s: a.s, f: a.f, state: i === focus ? 'current' : state[i] })),
      });
      const chosen = [];
      let last = -1;
      r.step(1, L('끝나는 시각이 빠른 순으로 정렬했습니다.', 'Sorted by finishing time.'), view(), {});
      items.forEach((a, i) => {
        const ok = a.s >= last;
        r.step(3, L(ok ? `(${a.s}, ${a.f}) 을(를) 살펴봅니다.` : `(${a.s}, ${a.f}) 은(는) ${last} 이전에 시작해 겹칩니다.`, ok ? `Consider (${a.s}, ${a.f}).` : `(${a.s}, ${a.f}) starts before ${last}, so it overlaps.`), view(i, last < 0 ? null : last), { start: a.s, finish: a.f });
        state[i] = ok ? 'taken' : 'skip';
        if (ok) { chosen.push(i); last = a.f; }
        r.step(3, L(ok ? `(${a.s}, ${a.f}) 선택` : `(${a.s}, ${a.f}) 건너뜀`, ok ? `Take (${a.s}, ${a.f})` : `Skip (${a.s}, ${a.f})`), view(-1, last < 0 ? null : last), { start: a.s, finish: a.f });
      });
      chosen.forEach((i) => { state[i] = 'found'; });
      r.step(3, L(`${chosen.length}개를 골랐습니다.`, `Selected ${chosen.length}.`), view(-1, last < 0 ? null : last), { result: chosen.length });
    });
  },
};

export const factorial = {
  id: 'factorial', category: 'math', view: 'table',
  name: L('팩토리얼', 'Factorial'),
  summary: L('1부터 n까지 곱한 n! 을 차례로 채웁니다.', 'Fills n! by multiplying 1 × 2 × … × n.'),
  description: L(
    'n! = n × (n − 1)! 이고 0! = 1입니다. 작은 값부터 표를 곱해 나가면 같은 곱을 다시 하지 않습니다.\n\n재귀로 정의해도 결과는 같고, 여기서는 아래서 위로 곱합니다. n은 0~20입니다.',
    'n! = n × (n − 1)! and 0! = 1. Multiplying upward stores each product once.\n\nA recursive definition gives the same number. This version multiplies from the bottom up. n is 0–20.'),
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(n)' },
  traits: L('재귀 · 반복', 'Recursion · Iteration'),
  input: {
    default: 'n: 10',
    hint: L('n: 0~20', 'n: 0–20'),
    parse: (text) => parseInteger(parseKeyed(text).keys.n ?? text, 'n', 0, 20),
    random: () => `n: ${randInt(5, 16)}`,
  },
  pseudo: ['procedure factorial(n)', '  f[0] ← 1', '  for i ← 1 to n', '    f[i] ← f[i − 1] × i', '  return f[n]'],
  run(n) {
    return record((r) => {
      const f = [1n];
      const rows = [[0, '1']];
      const view = (row) => tableView({
        colHeaders: ['i', 'i!'],
        rowHeaders: rows.map((item) => String(item[0])),
        cells: rows.map((item) => [item[0], item[1]]),
        colors: { [`${row},1`]: 'write' },
      });
      r.step(1, L('0! = 1', '0! = 1'), view(0), { n });
      for (let i = 1; i <= n; i++) {
        f[i] = f[i - 1] * BigInt(i);
        rows.push([i, String(f[i])]);
        r.step(3, L(`${i}! = ${i - 1}! × ${i} = ${f[i]}`, `${i}! = ${i - 1}! × ${i} = ${f[i]}`), view(i), { i });
      }
      r.step(4, L(`${n}! = ${f[n]}`, `${n}! = ${f[n]}`), view(n), { result: String(f[n]) });
    });
  },
};

export const fastPower = {
  id: 'fast-power', category: 'math', view: 'table',
  name: L('분할 정복 거듭제곱', 'Exponentiation by Squaring'),
  summary: L('지수를 반으로 나눠 aⁿ 을 빠르게 구합니다.', 'Computes aⁿ by halving the exponent.'),
  description: L(
    'aⁿ에서 n이 짝수면 (aⁿᐟ²)², 홀수면 a × (aⁿᐟ²)² 입니다. 지수를 반씩 줄이므로 곱셈은 O(log n)번입니다.\n\n1을 반복해서 곱하는 O(n)보다 큰 지수에서 훨씬 적게 곱합니다.',
    'If n is even, aⁿ = (aⁿᐟ²)². If n is odd, multiply by one more a. Halving the exponent uses O(log n) multiplications.\n\nThat is far fewer multiplications than multiplying by a, n times.'),
  complexity: { best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)', space: 'O(1)' },
  traits: L('분할 정복', 'Divide and conquer'),
  input: {
    default: 'a: 2\nb: 10',
    hint: L('a: 밑 (0~9), b: 지수 (0~16)', 'a: base (0–9), b: exponent (0–16)'),
    parse(text) {
      const { keys } = parseKeyed(text);
      return { a: parseInteger(keys.a, 'a', 0, 9), b: parseInteger(keys.b, 'b', 0, 16) };
    },
    random: () => `a: ${randInt(2, 9)}\nb: ${randInt(2, 12)}`,
  },
  pseudo: ['procedure power(a, b)', '  result ← 1', '  while b > 0', '    if b is odd: result ← result × a', '    a ← a × a; b ← floor(b / 2)'],
  run({ a, b }) {
    return record((r) => {
      let base = BigInt(a); let exp = b; let result = 1n;
      const rows = [];
      const view = (col) => {
        const colors = {};
        if (col !== null && rows.length) colors[`${rows.length - 1},${col}`] = 'write';
        return tableView({ colHeaders: ['result', 'base', 'exp'], rowHeaders: rows.map((_, i) => String(i + 1)), cells: rows.map((row) => [...row]), colors });
      };
      const snap = (col) => { rows.push([String(result), String(base), String(exp)]); return view(col); };
      r.step(1, L(`${a}^${b} 를 지수를 반으로 줄이며 계산합니다.`, `Compute ${a}^${b} by halving the exponent.`), snap(null), { a, b });
      if (exp === 0) { r.step(4, L('지수가 0이면 1입니다.', 'Any a⁰ is 1.'), view(0), { result: '1' }); return; }
      while (exp > 0) {
        if (exp % 2) { result *= base; r.step(3, L(`홀수 지수: 결과에 ${base}를 곱해 ${result}`, `Odd exponent: result × ${base} = ${result}`), snap(0), { exp }); }
        exp = Math.floor(exp / 2);
        if (exp) { base *= base; r.step(4, L(`밑을 제곱하고 지수를 반으로: base=${base}, exp=${exp}`, `Square the base and halve the exponent: base=${base}, exp=${exp}`), snap(1), { exp }); }
      }
      r.step(4, L(`답은 ${result}입니다.`, `The result is ${result}.`), view(0), { result: String(result) });
    });
  },
};

export const naiveSearch = {
  id: 'naive-search', category: 'string', view: 'string',
  name: L('단순 문자열 검색', 'Naive String Search'),
  summary: L('패턴을 한 칸씩 밀면서 본문과 비교합니다.', 'Slides the pattern by one and compares it with the text.'),
  description: L(
    '본문의 각 시작 위치에서 패턴의 글자를 하나씩 비교합니다. 불일치하면 패턴을 한 칸만 옮기고 처음부터 다시 비교합니다.\n\nKMP보다 단순하고, 최악에는 본문 길이 × 패턴 길이만큼 비교합니다. 찾은 시작 위치를 출력합니다.',
    'At every start position, compare the pattern character by character. On a mismatch, shift the pattern by one and start over.\n\nIt is simpler than KMP and can take text length × pattern length comparisons. The output is the starting positions.'),
  complexity: { best: 'O(n)', average: 'O(n·m)', worst: 'O(n·m)', space: 'O(1)' },
  traits: L('문자열 검색 · 브루트 포스', 'String matching · Brute force'),
  input: {
    default: 'text: ABABDABACDABABCABAB\npattern: ABAB',
    hint: L('text: 본문 (최대 48자), pattern: 패턴 (최대 12자)', 'text up to 48 characters, pattern up to 12'),
    parse(text) {
      const { keys } = parseKeyed(text);
      const body = keys.text ?? '';
      const pattern = keys.pattern ?? '';
      if (!body || !pattern || body.length > 48 || pattern.length > 12 || pattern.length > body.length) throw new InputError('text와 pattern을 입력하세요. pattern이 더 짧아야 합니다.', 'Enter text and a shorter pattern.');
      return { text: body, pattern };
    },
    random() {
      const alphabet = 'ABC';
      const pattern = Array.from({ length: randInt(2, 3) }, () => alphabet[randInt(0, 2)]).join('');
      let body = '';
      while (body.length < 18) body += Math.random() < 0.25 ? pattern : alphabet[randInt(0, 2)];
      return `text: ${body.slice(0, 24)}\npattern: ${pattern}`;
    },
  },
  pseudo: ['procedure naiveSearch(T, P)', '  for s ← 0 to n − m', '    compare T[s..s+m) with P', '    if they match: report s'],
  run({ text: body, pattern }) {
    return record((r) => {
      const found = [];
      const view = (shift, matched) => ({ kind: 'string', text: body, pattern, shift, matched, found: [...found] });
      r.step(0, L(`"${pattern}" 을(를) 한 칸씩 밀며 찾습니다.`, `Slide "${pattern}" one place at a time.`), view(0, 0), {});
      for (let s = 0; s <= body.length - pattern.length; s++) {
        let matched = 0;
        while (matched < pattern.length && body[s + matched] === pattern[matched]) matched += 1;
        r.step(2, L(`위치 ${s}에서 ${matched}글자 일치`, `Position ${s}: ${matched} characters match`), view(s, matched), { s, matched });
        if (matched === pattern.length) {
          found.push(s);
          r.step(3, L(`위치 ${s}에서 패턴을 찾았습니다.`, `Pattern found at ${s}.`), view(s, matched), { s });
        }
      }
      r.step(3, L(found.length ? `위치 ${found.join(', ')}` : '없습니다.', found.length ? `At ${found.join(', ')}` : 'None.'), view(Math.max(0, body.length - pattern.length), 0), {});
    });
  },
};

export const GREEDY = { id: 'greedy', name: { ko: '그리디', en: 'Greedy' } };

export const TEXTBOOK = [
  cocktailSort, combSort, gnomeSort, oddEvenSort, countingSort, pancakeSort, dutchFlag,
  jumpSearch, interpolationSearch, exponentialSearch, quickselect,
  kadane, coinChange, lis, activitySelection, factorial, fastPower, naiveSearch,
];
