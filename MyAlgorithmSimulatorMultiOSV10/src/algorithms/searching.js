import { L, record, parseNumbers, parseKeyed, parseInteger, randomArray, randInt, InputError } from './core.js';
import { arrayView } from './sorting.js';

function searchInput(def, { sorted = false } = {}) {
  return {
    default: def,
    hint: L('첫 줄: 정수 목록, 둘째 줄: target: 찾을 값', 'Line 1: integers, line 2: target: value to find'),
    parse(text) {
      const { keys, rest } = parseKeyed(text);
      if (!rest.length) throw new InputError('정수 목록을 입력하세요.', 'Enter a list of integers.');
      let values = parseNumbers(rest.join(' '), { min: 1, max: 40 });
      if (sorted) values = [...values].sort((x, y) => x - y);
      const target = parseInteger(keys.target, 'target', -999, 999);
      return { values, target };
    },
    random() {
      const values = randomArray(randInt(8, 14), 1, 99);
      if (sorted) values.sort((x, y) => x - y);
      const target = Math.random() < 0.75 ? values[randInt(0, values.length - 1)] : randInt(1, 99);
      return `${values.join(', ')}\ntarget: ${target}`;
    },
  };
}

export const linearSearch = {
  id: 'linear-search', category: 'searching', view: 'array',
  name: L('선형 탐색', 'Linear Search'),
  summary: L('처음부터 하나씩 차례로 비교합니다.', 'Checks every element in turn.'),
  description: L(
    '선형(순차) 탐색은 배열의 첫 원소부터 끝까지 하나씩 **target** 과 비교합니다. 정렬되지 않은 데이터에서도 쓸 수 있는 가장 단순한 탐색입니다.',
    'Linear (sequential) search compares each element with the **target** from the first to the last. It is the simplest search and works on unsorted data.'),
  complexity: { best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)' },
  traits: L('정렬 불필요', 'No sorting required'),
  input: searchInput('14, 33, 27, 10, 35, 19, 42, 44\ntarget: 19'),
  pseudo: [
    'procedure linearSearch(A, target)',
    '  for i ← 0 to n − 1',
    '    if A[i] = target',
    '      return i',
    '  return −1',
  ],
  run({ values: a, target }) {
    return record((r) => {
      r.step(0, L(`${target} 을(를) 찾습니다.`, `Search for ${target}.`), arrayView(a), { target });
      const seen = [];
      for (let i = 0; i < a.length; i++) {
        r.step(2, L(`A[${i}]=${a[i]} = ${target} 인가?`, `Is A[${i}]=${a[i]} = ${target}?`), arrayView(a, { colors: { ...Object.fromEntries(seen.map((k) => [k, 'dim'])), [i]: 'compare' }, pointers: { i } }), { i, target });
        if (a[i] === target) {
          r.step(3, L(`찾았습니다! 인덱스 ${i}`, `Found at index ${i}!`), arrayView(a, { colors: { [i]: 'found' }, pointers: { i } }), { i, target, result: i });
          return;
        }
        seen.push(i);
      }
      r.step(4, L(`${target} 이(가) 없습니다. −1 반환`, `${target} is not present: return −1`), arrayView(a, { colors: Object.fromEntries(seen.map((k) => [k, 'dim'])) }), { target, result: -1 });
    });
  },
};

export const binarySearch = {
  id: 'binary-search', category: 'searching', view: 'array',
  name: L('이진 탐색', 'Binary Search'),
  summary: L('정렬된 배열을 반씩 줄여 가며 찾습니다.', 'Halves the search range of a sorted array each step.'),
  description: L(
    '이진 탐색은 **정렬된** 배열에서 가운데 값(mid)과 target 을 비교해, 찾는 값이 있을 수 없는 절반을 버립니다. 매 단계 범위가 절반이 되므로 100만 개에서도 약 20번이면 찾습니다.\n\n입력한 값은 자동으로 정렬해서 사용합니다.',
    'Binary search works on a **sorted** array: it compares the middle value (mid) with the target and discards the half that cannot contain it. The range halves every step, so a million elements take about 20 steps.\n\nThe values you enter are sorted automatically.'),
  complexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)', space: 'O(1)' },
  traits: L('정렬된 입력 필요', 'Requires sorted input'),
  input: searchInput('3, 8, 12, 17, 23, 31, 38, 45, 52, 60, 71, 88\ntarget: 52', { sorted: true }),
  pseudo: [
    'procedure binarySearch(A, target)   // A is sorted',
    '  lo ← 0; hi ← n − 1',
    '  while lo ≤ hi',
    '    mid ← (lo + hi) / 2',
    '    if A[mid] = target: return mid',
    '    else if A[mid] < target: lo ← mid + 1',
    '    else hi ← mid − 1',
    '  return −1',
  ],
  run({ values: a, target }) {
    return record((r) => {
      let lo = 0;
      let hi = a.length - 1;
      const outside = () => Object.fromEntries(a.map((_, k) => [k, 'dim']).filter(([k]) => k < lo || k > hi));
      r.step(1, L(`${target} 을(를) 찾습니다. 범위 [${lo}..${hi}]`, `Search for ${target}. Range [${lo}..${hi}]`), arrayView(a, { range: [lo, hi], pointers: { lo, hi } }), { lo, hi, target });
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        r.step(3, L(`mid = (${lo} + ${hi}) / 2 = ${mid}, A[mid] = ${a[mid]}`, `mid = (${lo} + ${hi}) / 2 = ${mid}, A[mid] = ${a[mid]}`), arrayView(a, { range: [lo, hi], colors: { ...outside(), [mid]: 'compare' }, pointers: { lo, mid, hi } }), { lo, mid, hi, target });
        if (a[mid] === target) {
          r.step(4, L(`찾았습니다! 인덱스 ${mid}`, `Found at index ${mid}!`), arrayView(a, { colors: { ...outside(), [mid]: 'found' }, pointers: { mid } }), { lo, mid, hi, result: mid });
          return;
        }
        if (a[mid] < target) {
          lo = mid + 1;
          r.step(5, L(`${a[mid]} < ${target}: 오른쪽 절반으로 (lo ← ${lo})`, `${a[mid]} < ${target}: go right (lo ← ${lo})`), arrayView(a, { range: lo <= hi ? [lo, hi] : null, colors: outside(), pointers: { lo, hi } }), { lo, hi, target });
        } else {
          hi = mid - 1;
          r.step(6, L(`${a[mid]} > ${target}: 왼쪽 절반으로 (hi ← ${hi})`, `${a[mid]} > ${target}: go left (hi ← ${hi})`), arrayView(a, { range: lo <= hi ? [lo, hi] : null, colors: outside(), pointers: { lo, hi } }), { lo, hi, target });
        }
      }
      r.step(7, L(`범위가 비었습니다. ${target} 은(는) 없습니다.`, `The range is empty: ${target} is not present.`), arrayView(a, { colors: outside() }), { lo, hi, result: -1 });
    });
  },
};

export const SEARCHING = [linearSearch, binarySearch];
