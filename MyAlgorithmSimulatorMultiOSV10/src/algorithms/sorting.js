import { L, record, parseNumbers, randomArray, copy } from './core.js';

/** Array view snapshot. colors: index → compare | swap | pivot | active | min | found | dim | write */
export function arrayView(a, { colors = {}, done = [], pointers = {}, range = null, aux = null, buckets = null, heapSize = null } = {}) {
  return { kind: 'array', values: [...a], colors: { ...colors }, done: [...done], pointers: { ...pointers }, range: range ? [...range] : null, aux: copy(aux) ?? null, buckets: copy(buckets) ?? null, heapSize };
}

const all = (n) => Array.from({ length: n }, (_, i) => i);

const numbersInput = (def, { lo = 1, hi = 99, n = 12 } = {}) => ({
  default: def,
  hint: L('정수를 쉼표나 공백으로 구분해 입력하세요 (2~40개).', 'Integers separated by commas or spaces (2–40).'),
  parse: (text) => parseNumbers(text, { min: 2, max: 40, lo, hi }),
  random: () => randomArray(n, Math.max(lo, 1), hi).join(', '),
});

const SORT_COMPLEXITY_N2 = { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' };

export const bubbleSort = {
  id: 'bubble-sort', category: 'sorting', view: 'array',
  name: L('버블 정렬', 'Bubble Sort'),
  summary: L('이웃한 두 값을 비교해 큰 값을 뒤로 보냅니다.', 'Compares neighbours and bubbles the larger one to the end.'),
  description: L(
    '버블 정렬은 배열을 처음부터 끝까지 훑으면서 **이웃한 두 원소**를 비교하고, 순서가 틀리면 서로 바꿉니다. 한 바퀴를 돌 때마다 가장 큰 값이 맨 뒤로 "거품처럼" 올라가 자리를 잡습니다.\n\n한 바퀴 동안 한 번도 바꾸지 않았다면 이미 정렬된 것이므로 일찍 끝낼 수 있습니다(최선 O(n)).',
    'Bubble sort sweeps the array comparing **adjacent elements** and swaps them when they are out of order. After each pass the largest remaining value has "bubbled" to its final place at the end.\n\nIf a pass makes no swap the array is already sorted and the algorithm stops early (best case O(n)).'),
  complexity: SORT_COMPLEXITY_N2,
  traits: L('안정 정렬 · 제자리 정렬', 'Stable · In-place'),
  input: numbersInput('38, 27, 43, 3, 9, 82, 10, 55'),
  pseudo: [
    'procedure bubbleSort(A)',
    '  for i ← 0 to n − 2',
    '    swapped ← false',
    '    for j ← 0 to n − 2 − i',
    '      if A[j] > A[j + 1]',
    '        swap A[j], A[j + 1]',
    '        swapped ← true',
    '    if not swapped: break',
    '  return A',
  ],
  run(input) {
    const a = [...input];
    const n = a.length;
    return record((r) => {
      const done = [];
      r.step(0, L('버블 정렬을 시작합니다.', 'Start bubble sort.'), arrayView(a), { n });
      for (let i = 0; i < n - 1; i++) {
        let swapped = false;
        r.step(1, L(`${i + 1}번째 바퀴 (i = ${i})`, `Pass ${i + 1} (i = ${i})`), arrayView(a, { done }), { i, n });
        for (let j = 0; j < n - 1 - i; j++) {
          r.step(4, L(`A[${j}]=${a[j]} 와 A[${j + 1}]=${a[j + 1]} 비교`, `Compare A[${j}]=${a[j]} and A[${j + 1}]=${a[j + 1]}`), arrayView(a, { colors: { [j]: 'compare', [j + 1]: 'compare' }, done, pointers: { j } }), { i, j, swapped });
          if (a[j] > a[j + 1]) {
            [a[j], a[j + 1]] = [a[j + 1], a[j]];
            swapped = true;
            r.step(5, L(`${a[j + 1]} > ${a[j]} 이므로 교환`, `${a[j + 1]} > ${a[j]}: swap`), arrayView(a, { colors: { [j]: 'swap', [j + 1]: 'swap' }, done, pointers: { j } }), { i, j, swapped });
          }
        }
        done.push(n - 1 - i);
        r.step(3, L(`A[${n - 1 - i}]=${a[n - 1 - i]} 자리 확정`, `A[${n - 1 - i}]=${a[n - 1 - i]} is in place`), arrayView(a, { done }), { i, swapped });
        if (!swapped) {
          r.step(7, L('교환이 없었으므로 이미 정렬되었습니다.', 'No swaps in this pass: already sorted.'), arrayView(a, { done: all(n) }), { i, swapped });
          break;
        }
      }
      r.step(8, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const selectionSort = {
  id: 'selection-sort', category: 'sorting', view: 'array',
  name: L('선택 정렬', 'Selection Sort'),
  summary: L('남은 값 중 최솟값을 골라 앞자리로 옮깁니다.', 'Selects the minimum of the rest and moves it to the front.'),
  description: L(
    '선택 정렬은 정렬되지 않은 부분에서 **가장 작은 값**을 찾아 그 부분의 맨 앞과 바꿉니다. 이것을 n − 1번 반복하면 앞에서부터 차례로 자리가 확정됩니다.\n\n비교 횟수는 입력과 관계없이 항상 n(n−1)/2번이지만, 교환은 최대 n − 1번뿐입니다.',
    'Selection sort finds the **smallest value** in the unsorted part and swaps it with the first element of that part. Repeating this n − 1 times fixes the positions from the front.\n\nIt always makes n(n−1)/2 comparisons, but at most n − 1 swaps.'),
  complexity: { best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('불안정 정렬 · 제자리 정렬', 'Unstable · In-place'),
  input: numbersInput('29, 72, 98, 13, 87, 66, 52, 51, 36'),
  pseudo: [
    'procedure selectionSort(A)',
    '  for i ← 0 to n − 2',
    '    min ← i',
    '    for j ← i + 1 to n − 1',
    '      if A[j] < A[min]',
    '        min ← j',
    '    if min ≠ i',
    '      swap A[i], A[min]',
    '  return A',
  ],
  run(input) {
    const a = [...input];
    const n = a.length;
    return record((r) => {
      const done = [];
      r.step(0, L('선택 정렬을 시작합니다.', 'Start selection sort.'), arrayView(a), { n });
      for (let i = 0; i < n - 1; i++) {
        let min = i;
        r.step(2, L(`i = ${i}: 일단 A[${i}]=${a[i]} 를 최솟값으로 둡니다.`, `i = ${i}: assume A[${i}]=${a[i]} is the minimum.`), arrayView(a, { colors: { [i]: 'min' }, done, pointers: { i, min } }), { i, min });
        for (let j = i + 1; j < n; j++) {
          r.step(4, L(`A[${j}]=${a[j]} 와 최솟값 A[${min}]=${a[min]} 비교`, `Compare A[${j}]=${a[j]} with min A[${min}]=${a[min]}`), arrayView(a, { colors: { [min]: 'min', [j]: 'compare' }, done, pointers: { i, j, min } }), { i, j, min });
          if (a[j] < a[min]) {
            min = j;
            r.step(5, L(`새 최솟값: A[${min}]=${a[min]}`, `New minimum: A[${min}]=${a[min]}`), arrayView(a, { colors: { [min]: 'min' }, done, pointers: { i, j, min } }), { i, j, min });
          }
        }
        if (min !== i) {
          [a[i], a[min]] = [a[min], a[i]];
          r.step(7, L(`A[${i}] 와 A[${min}] 교환`, `Swap A[${i}] and A[${min}]`), arrayView(a, { colors: { [i]: 'swap', [min]: 'swap' }, done, pointers: { i, min } }), { i, min });
        }
        done.push(i);
        r.step(1, L(`A[${i}]=${a[i]} 자리 확정`, `A[${i}]=${a[i]} is in place`), arrayView(a, { done }), { i });
      }
      r.step(8, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const insertionSort = {
  id: 'insertion-sort', category: 'sorting', view: 'array',
  name: L('삽입 정렬', 'Insertion Sort'),
  summary: L('카드를 정리하듯 값을 알맞은 자리에 끼워 넣습니다.', 'Inserts each value into place, like sorting playing cards.'),
  description: L(
    '삽입 정렬은 앞부분을 정렬된 상태로 유지하면서, 다음 값(**key**)을 꺼내 자기보다 큰 값들을 한 칸씩 뒤로 밀고 빈자리에 넣습니다. 손에 든 카드를 정리하는 방법과 같습니다.\n\n거의 정렬된 데이터에서는 매우 빠릅니다(최선 O(n)).',
    'Insertion sort keeps the front part sorted. It takes the next value (the **key**), shifts the larger values one place to the right and drops the key into the gap — just like sorting a hand of cards.\n\nIt is very fast on nearly sorted data (best case O(n)).'),
  complexity: SORT_COMPLEXITY_N2,
  traits: L('안정 정렬 · 제자리 정렬 · 온라인', 'Stable · In-place · Online'),
  input: numbersInput('31, 41, 59, 26, 41, 58, 12, 7'),
  pseudo: [
    'procedure insertionSort(A)',
    '  for i ← 1 to n − 1',
    '    key ← A[i]',
    '    j ← i − 1',
    '    while j ≥ 0 and A[j] > key',
    '      A[j + 1] ← A[j]',
    '      j ← j − 1',
    '    A[j + 1] ← key',
    '  return A',
  ],
  run(input) {
    const a = [...input];
    const n = a.length;
    const sortedUpTo = (i) => Array.from({ length: i + 1 }, (_, k) => k);
    return record((r) => {
      r.step(0, L('삽입 정렬을 시작합니다. A[0] 하나는 이미 정렬된 상태입니다.', 'Start insertion sort. A[0] alone is already sorted.'), arrayView(a, { done: [0] }), { n });
      for (let i = 1; i < n; i++) {
        const key = a[i];
        let j = i - 1;
        r.step(2, L(`key ← A[${i}] = ${key}`, `key ← A[${i}] = ${key}`), arrayView(a, { colors: { [i]: 'active' }, done: sortedUpTo(i - 1), pointers: { i }, aux: { label: 'key', values: [key] } }), { i, key, j });
        while (j >= 0) {
          r.step(4, L(`A[${j}]=${a[j]} > key(${key}) 인가?`, `Is A[${j}]=${a[j]} > key(${key})?`), arrayView(a, { colors: { [j]: 'compare', [j + 1]: 'active' }, done: sortedUpTo(i - 1), pointers: { j }, aux: { label: 'key', values: [key] } }), { i, key, j });
          if (a[j] <= key) break;
          a[j + 1] = a[j];
          r.step(5, L(`${a[j]} 을(를) 오른쪽으로 한 칸 이동`, `Shift ${a[j]} one place right`), arrayView(a, { colors: { [j + 1]: 'write', [j]: 'active' }, done: sortedUpTo(i - 1), pointers: { j }, aux: { label: 'key', values: [key] } }), { i, key, j });
          j--;
        }
        a[j + 1] = key;
        r.step(7, L(`A[${j + 1}] ← key(${key})`, `A[${j + 1}] ← key(${key})`), arrayView(a, { colors: { [j + 1]: 'swap' }, done: sortedUpTo(i), pointers: { i } }), { i, key, j });
      }
      r.step(8, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const shellSort = {
  id: 'shell-sort', category: 'sorting', view: 'array',
  name: L('셸 정렬', 'Shell Sort'),
  summary: L('간격(gap)을 줄여 가며 삽입 정렬을 반복합니다.', 'Insertion sort over shrinking gaps.'),
  description: L(
    '셸 정렬은 멀리 떨어진 원소끼리 먼저 정렬해 값을 빠르게 제자리 근처로 옮긴 뒤, **간격(gap)**을 절반씩 줄이며 삽입 정렬을 반복합니다. 마지막 간격 1은 보통의 삽입 정렬이지만, 이미 거의 정렬되어 있어 빠르게 끝납니다.',
    'Shell sort first sorts elements that are far apart, moving values close to their place quickly, then repeats insertion sort with a **gap** halved each time. The final gap of 1 is plain insertion sort, but by then the array is almost sorted.'),
  complexity: { best: 'O(n log n)', average: 'O(n^1.5)', worst: 'O(n²)', space: 'O(1)' },
  traits: L('불안정 정렬 · 제자리 정렬', 'Unstable · In-place'),
  input: numbersInput('62, 83, 18, 53, 7, 17, 95, 86, 47, 69, 25, 28'),
  pseudo: [
    'procedure shellSort(A)',
    '  gap ← n / 2',
    '  while gap > 0',
    '    for i ← gap to n − 1',
    '      temp ← A[i]; j ← i',
    '      while j ≥ gap and A[j − gap] > temp',
    '        A[j] ← A[j − gap]; j ← j − gap',
    '      A[j] ← temp',
    '    gap ← gap / 2',
    '  return A',
  ],
  run(input) {
    const a = [...input];
    const n = a.length;
    return record((r) => {
      r.step(0, L('셸 정렬을 시작합니다.', 'Start shell sort.'), arrayView(a), { n });
      for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) {
        r.step(2, L(`gap = ${gap}: ${gap}칸 떨어진 원소끼리 삽입 정렬`, `gap = ${gap}: insertion sort on elements ${gap} apart`), arrayView(a), { gap });
        for (let i = gap; i < n; i++) {
          const temp = a[i];
          let j = i;
          r.step(4, L(`temp ← A[${i}] = ${temp}`, `temp ← A[${i}] = ${temp}`), arrayView(a, { colors: { [i]: 'active' }, pointers: { i }, aux: { label: 'temp', values: [temp] } }), { gap, i, j, temp });
          while (j >= gap) {
            r.step(5, L(`A[${j - gap}]=${a[j - gap]} > temp(${temp}) 인가?`, `Is A[${j - gap}]=${a[j - gap]} > temp(${temp})?`), arrayView(a, { colors: { [j - gap]: 'compare', [j]: 'active' }, pointers: { j }, aux: { label: 'temp', values: [temp] } }), { gap, i, j, temp });
            if (a[j - gap] <= temp) break;
            a[j] = a[j - gap];
            r.step(6, L(`A[${j}] ← A[${j - gap}] (${a[j]})`, `A[${j}] ← A[${j - gap}] (${a[j]})`), arrayView(a, { colors: { [j]: 'write', [j - gap]: 'active' }, pointers: { j }, aux: { label: 'temp', values: [temp] } }), { gap, i, j, temp });
            j -= gap;
          }
          a[j] = temp;
          r.step(7, L(`A[${j}] ← temp(${temp})`, `A[${j}] ← temp(${temp})`), arrayView(a, { colors: { [j]: 'swap' }, pointers: { j } }), { gap, i, j, temp });
        }
        r.step(8, L('gap 을 절반으로 줄입니다.', 'Halve the gap.'), arrayView(a), { gap });
      }
      r.step(9, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const mergeSort = {
  id: 'merge-sort', category: 'sorting', view: 'array',
  name: L('병합 정렬', 'Merge Sort'),
  summary: L('반으로 나누어 정렬한 뒤 두 부분을 병합합니다.', 'Divide in halves, sort each, then merge.'),
  description: L(
    '병합 정렬은 대표적인 **분할 정복** 알고리즘입니다. 배열을 반으로 계속 나누어 크기 1이 될 때까지 쪼갠 다음, 정렬된 두 부분을 앞에서부터 비교하며 하나로 **병합**합니다.\n\n항상 O(n log n)을 보장하지만, 병합할 때 임시 배열(아래 줄)이 필요합니다.',
    'Merge sort is the classic **divide and conquer** algorithm. It keeps splitting the array in half down to single elements, then **merges** sorted halves by repeatedly taking the smaller front element.\n\nIt always runs in O(n log n) but needs a temporary array (the lower row) for merging.'),
  complexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)' },
  traits: L('안정 정렬 · 분할 정복', 'Stable · Divide and conquer'),
  input: numbersInput('38, 27, 43, 3, 9, 82, 10, 64'),
  pseudo: [
    'procedure mergeSort(A, lo, hi)',
    '  if lo ≥ hi: return',
    '  mid ← (lo + hi) / 2',
    '  mergeSort(A, lo, mid)',
    '  mergeSort(A, mid + 1, hi)',
    '  merge(A, lo, mid, hi)',
    'procedure merge(A, lo, mid, hi)',
    '  T ← copy of A[lo..hi]; i ← lo; j ← mid + 1',
    '  for k ← lo to hi',
    '    if j > hi or (i ≤ mid and T[i] ≤ T[j])',
    '      A[k] ← T[i]; i ← i + 1',
    '    else A[k] ← T[j]; j ← j + 1',
  ],
  run(input) {
    const a = [...input];
    const n = a.length;
    return record((r) => {
      const blank = () => Array(n).fill(null);
      r.step(0, L('병합 정렬을 시작합니다.', 'Start merge sort.'), arrayView(a, { range: [0, n - 1] }), { lo: 0, hi: n - 1 });
      const sort = (lo, hi, depth) => {
        if (lo >= hi) {
          r.step(1, L(`A[${lo}] 하나뿐이므로 이미 정렬됨`, `A[${lo}] alone is sorted`), arrayView(a, { range: [lo, hi], colors: { [lo]: 'active' } }), { lo, hi, depth });
          return;
        }
        const mid = Math.floor((lo + hi) / 2);
        r.step(2, L(`[${lo}..${hi}] 를 [${lo}..${mid}] 와 [${mid + 1}..${hi}] 로 나눕니다.`, `Split [${lo}..${hi}] into [${lo}..${mid}] and [${mid + 1}..${hi}]`), arrayView(a, { range: [lo, hi], pointers: { lo, mid, hi } }), { lo, mid, hi, depth });
        sort(lo, mid, depth + 1);
        sort(mid + 1, hi, depth + 1);
        const t = blank();
        for (let k = lo; k <= hi; k++) t[k] = a[k];
        let i = lo;
        let j = mid + 1;
        r.step(7, L(`[${lo}..${mid}] 와 [${mid + 1}..${hi}] 병합: 임시 배열 T 에 복사`, `Merge [${lo}..${mid}] and [${mid + 1}..${hi}]: copy into T`), arrayView(a, { range: [lo, hi], pointers: { lo, mid, hi }, aux: { label: 'T', values: t, colors: {} } }), { lo, mid, hi, i, j });
        for (let k = lo; k <= hi; k++) {
          const takeLeft = j > hi || (i <= mid && t[i] <= t[j]);
          const auxColors = {};
          if (i <= mid) auxColors[i] = 'compare';
          if (j <= hi) auxColors[j] = 'compare';
          r.step(9, L(`T[${i <= mid ? i : '-'}]${i <= mid ? `=${t[i]}` : ''} 와 T[${j <= hi ? j : '-'}]${j <= hi ? `=${t[j]}` : ''} 중 작은 값 선택`, `Pick the smaller of T[${i <= mid ? i : '-'}]${i <= mid ? `=${t[i]}` : ''} and T[${j <= hi ? j : '-'}]${j <= hi ? `=${t[j]}` : ''}`), arrayView(a, { range: [lo, hi], colors: { [k]: 'active' }, pointers: { k }, aux: { label: 'T', values: t, colors: auxColors } }), { lo, mid, hi, i, j, k });
          if (takeLeft) { a[k] = t[i]; i++; } else { a[k] = t[j]; j++; }
          r.step(takeLeft ? 10 : 11, L(`A[${k}] ← ${a[k]}`, `A[${k}] ← ${a[k]}`), arrayView(a, { range: [lo, hi], colors: { [k]: 'write' }, pointers: { k }, aux: { label: 'T', values: t, colors: { [takeLeft ? i - 1 : j - 1]: 'dim' } } }), { lo, mid, hi, i, j, k });
        }
        r.step(5, L(`[${lo}..${hi}] 병합 완료`, `[${lo}..${hi}] merged`), arrayView(a, { range: [lo, hi], colors: Object.fromEntries(Array.from({ length: hi - lo + 1 }, (_, x) => [lo + x, 'found'])) }), { lo, hi });
      };
      sort(0, n - 1, 0);
      r.step(0, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const quickSort = {
  id: 'quick-sort', category: 'sorting', view: 'array',
  name: L('퀵 정렬', 'Quick Sort'),
  summary: L('피벗을 기준으로 작은 값과 큰 값으로 나눕니다.', 'Partitions around a pivot, then recurses.'),
  description: L(
    '퀵 정렬은 **피벗(pivot)** 하나를 골라 피벗보다 작은 값은 왼쪽, 큰 값은 오른쪽으로 모읍니다(분할). 피벗은 그 자리에서 위치가 확정되고, 양쪽 부분을 같은 방법으로 다시 정렬합니다.\n\n여기서는 마지막 원소를 피벗으로 쓰는 **로무토(Lomuto) 분할**을 사용합니다. 평균 O(n log n)으로 매우 빠르지만, 이미 정렬된 입력에서는 O(n²)이 됩니다.',
    'Quick sort picks a **pivot**, moves smaller values to its left and larger ones to its right (partition), which fixes the pivot in place, then sorts both sides the same way.\n\nThis uses the **Lomuto partition** with the last element as pivot. It averages O(n log n) and is very fast in practice, but degrades to O(n²) on already sorted input.'),
  complexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)' },
  traits: L('불안정 정렬 · 제자리 정렬 · 분할 정복', 'Unstable · In-place · Divide and conquer'),
  input: numbersInput('10, 80, 30, 90, 40, 50, 70, 20, 60'),
  pseudo: [
    'procedure quickSort(A, lo, hi)',
    '  if lo ≥ hi: return',
    '  p ← partition(A, lo, hi)',
    '  quickSort(A, lo, p − 1)',
    '  quickSort(A, p + 1, hi)',
    'procedure partition(A, lo, hi)',
    '  pivot ← A[hi]; i ← lo',
    '  for j ← lo to hi − 1',
    '    if A[j] < pivot',
    '      swap A[i], A[j]; i ← i + 1',
    '  swap A[i], A[hi]',
    '  return i',
  ],
  run(input) {
    const a = [...input];
    const n = a.length;
    return record((r) => {
      const done = [];
      r.step(0, L('퀵 정렬을 시작합니다.', 'Start quick sort.'), arrayView(a, { range: [0, n - 1] }), { lo: 0, hi: n - 1 });
      const sort = (lo, hi) => {
        if (lo > hi) return;
        if (lo === hi) {
          done.push(lo);
          r.step(1, L(`A[${lo}] 하나뿐이므로 자리 확정`, `A[${lo}] alone: in place`), arrayView(a, { range: [lo, hi], done }), { lo, hi });
          return;
        }
        const pivot = a[hi];
        let i = lo;
        r.step(6, L(`[${lo}..${hi}] 분할: 피벗 = A[${hi}] = ${pivot}`, `Partition [${lo}..${hi}]: pivot = A[${hi}] = ${pivot}`), arrayView(a, { range: [lo, hi], colors: { [hi]: 'pivot' }, done, pointers: { i } }), { lo, hi, pivot, i });
        for (let j = lo; j < hi; j++) {
          r.step(8, L(`A[${j}]=${a[j]} < 피벗(${pivot}) 인가?`, `Is A[${j}]=${a[j]} < pivot(${pivot})?`), arrayView(a, { range: [lo, hi], colors: { [hi]: 'pivot', [j]: 'compare' }, done, pointers: { i, j } }), { lo, hi, pivot, i, j });
          if (a[j] < pivot) {
            [a[i], a[j]] = [a[j], a[i]];
            r.step(9, L(`A[${i}] 와 A[${j}] 교환, i ← ${i + 1}`, `Swap A[${i}] and A[${j}], i ← ${i + 1}`), arrayView(a, { range: [lo, hi], colors: { [hi]: 'pivot', [i]: 'swap', [j]: 'swap' }, done, pointers: { i, j } }), { lo, hi, pivot, i, j });
            i++;
          }
        }
        [a[i], a[hi]] = [a[hi], a[i]];
        done.push(i);
        r.step(10, L(`피벗을 A[${i}] 로 옮깁니다. 피벗 자리 확정`, `Move the pivot to A[${i}]: in place`), arrayView(a, { range: [lo, hi], colors: { [i]: 'pivot' }, done, pointers: { p: i } }), { lo, hi, pivot, p: i });
        sort(lo, i - 1);
        sort(i + 1, hi);
      };
      sort(0, n - 1);
      r.step(0, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const heapSort = {
  id: 'heap-sort', category: 'sorting', view: 'array',
  name: L('힙 정렬', 'Heap Sort'),
  summary: L('최대 힙을 만든 뒤 가장 큰 값을 하나씩 꺼냅니다.', 'Builds a max-heap and extracts the maximum repeatedly.'),
  description: L(
    '힙 정렬은 배열을 **최대 힙**(부모 ≥ 자식인 완전 이진 트리)으로 만든 다음, 루트(최댓값)를 맨 뒤와 바꾸고 힙 크기를 줄여 다시 힙을 정리(sift-down)하는 일을 반복합니다.\n\n배열 인덱스 i 의 자식은 2i+1, 2i+2 입니다. 아래 트리 그림은 배열이 힙으로 어떻게 보이는지 나타냅니다.',
    'Heap sort turns the array into a **max-heap** (a complete binary tree where parent ≥ children), then repeatedly swaps the root (the maximum) with the last element, shrinks the heap and restores it with sift-down.\n\nThe children of index i are 2i+1 and 2i+2. The tree below shows how the array looks as a heap.'),
  complexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)' },
  traits: L('불안정 정렬 · 제자리 정렬', 'Unstable · In-place'),
  input: numbersInput('4, 10, 3, 5, 1, 8, 9, 2, 7'),
  pseudo: [
    'procedure heapSort(A)',
    '  for i ← n/2 − 1 down to 0',
    '    siftDown(A, i, n)',
    '  for end ← n − 1 down to 1',
    '    swap A[0], A[end]',
    '    siftDown(A, 0, end)',
    'procedure siftDown(A, i, size)',
    '  largest ← i; l ← 2i + 1; r ← 2i + 2',
    '  if l < size and A[l] > A[largest]: largest ← l',
    '  if r < size and A[r] > A[largest]: largest ← r',
    '  if largest ≠ i',
    '    swap A[i], A[largest]; siftDown(A, largest, size)',
  ],
  run(input) {
    const a = [...input];
    const n = a.length;
    return record((r) => {
      const done = [];
      const v = (size, extra = {}) => arrayView(a, { done, heapSize: size, ...extra });
      const sift = (start, size) => {
        let i = start;
        for (;;) {
          const l = 2 * i + 1;
          const rr = 2 * i + 2;
          let largest = i;
          const colors = { [i]: 'active' };
          if (l < size) colors[l] = 'compare';
          if (rr < size) colors[rr] = 'compare';
          r.step(7, L(`노드 A[${i}]=${a[i]} 와 자식 비교`, `Compare node A[${i}]=${a[i]} with its children`), v(size, { colors, pointers: { i } }), { i, l, r: rr, size });
          if (l < size && a[l] > a[largest]) largest = l;
          if (rr < size && a[rr] > a[largest]) largest = rr;
          if (largest === i) {
            r.step(10, L(`A[${i}] 가 자식보다 크거나 같으므로 멈춤`, `A[${i}] ≥ its children: stop`), v(size, { colors: { [i]: 'found' } }), { i, size });
            return;
          }
          [a[i], a[largest]] = [a[largest], a[i]];
          r.step(11, L(`A[${i}] 와 더 큰 자식 A[${largest}] 교환`, `Swap A[${i}] with the larger child A[${largest}]`), v(size, { colors: { [i]: 'swap', [largest]: 'swap' } }), { i, largest, size });
          i = largest;
        }
      };
      r.step(0, L('힙 정렬을 시작합니다. 먼저 최대 힙을 만듭니다.', 'Start heap sort. First build a max-heap.'), v(n), { n });
      for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
        r.step(2, L(`siftDown(${i}) — 부분 트리를 힙으로 정리`, `siftDown(${i}) — heapify the subtree`), v(n, { colors: { [i]: 'active' } }), { i });
        sift(i, n);
      }
      r.step(3, L('최대 힙 완성! 루트가 최댓값입니다.', 'Max-heap built: the root is the maximum.'), v(n, { colors: { 0: 'pivot' } }), {});
      for (let end = n - 1; end >= 1; end--) {
        [a[0], a[end]] = [a[end], a[0]];
        done.push(end);
        r.step(4, L(`최댓값 ${a[end]} 을(를) A[${end}] 로 보냅니다.`, `Move the maximum ${a[end]} to A[${end}]`), v(end, { colors: { 0: 'swap', [end]: 'swap' } }), { end });
        sift(0, end);
      }
      done.push(0);
      r.step(0, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const radixSort = {
  id: 'radix-sort', category: 'sorting', view: 'array',
  name: L('기수 정렬', 'Radix Sort'),
  summary: L('일의 자리부터 자릿수별로 버킷에 나누어 정렬합니다.', 'Distributes numbers into digit buckets, least significant digit first.'),
  description: L(
    '기수 정렬(LSD)은 값을 서로 **비교하지 않는** 정렬입니다. 일의 자리 숫자로 0~9 버킷에 나눠 담았다가 순서대로 꺼내고, 다음은 십의 자리, 백의 자리… 순으로 반복합니다. 각 단계가 안정적이므로 마지막 자리까지 끝나면 전체가 정렬됩니다.\n\nd 를 최대 자릿수라 할 때 O(d·(n + 10)) 입니다. 0 이상의 정수에만 쓸 수 있습니다.',
    'LSD radix sort **never compares** values. It distributes them into buckets 0–9 by the ones digit, collects them in order, then repeats with the tens digit, the hundreds digit… Because each pass is stable, the array is sorted after the last digit.\n\nIt runs in O(d·(n + 10)) for d digits. Non-negative integers only.'),
  complexity: { best: 'O(d·n)', average: 'O(d·n)', worst: 'O(d·n)', space: 'O(n + k)' },
  traits: L('안정 정렬 · 비교하지 않는 정렬', 'Stable · Non-comparison'),
  input: { ...numbersInput('170, 45, 75, 90, 802, 24, 2, 66', { lo: 0, hi: 999 }), hint: L('0~999 사이의 정수 (2~40개)', 'Integers 0–999 (2–40)'), random: () => randomArray(10, 0, 999).join(', ') },
  pseudo: [
    'procedure radixSort(A)',
    '  max ← maximum of A; exp ← 1',
    '  while max / exp > 0',
    '    buckets[0..9] ← empty',
    '    for each x in A',
    '      append x to buckets[(x / exp) mod 10]',
    '    A ← buckets[0] + … + buckets[9]',
    '    exp ← exp × 10',
    '  return A',
  ],
  run(input) {
    let a = [...input];
    const n = a.length;
    return record((r) => {
      const max = Math.max(...a);
      r.step(1, L(`최댓값 = ${max}`, `Maximum = ${max}`), arrayView(a, { buckets: Array.from({ length: 10 }, () => []) }), { max, exp: 1 });
      for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
        const buckets = Array.from({ length: 10 }, () => []);
        const place = L(exp === 1 ? '일' : exp === 10 ? '십' : exp === 100 ? '백' : `${exp}`, exp === 1 ? 'ones' : exp === 10 ? 'tens' : exp === 100 ? 'hundreds' : `${exp}s`);
        r.step(3, L(`${place.ko}의 자리 기준으로 나눕니다 (exp = ${exp})`, `Distribute by the ${place.en} digit (exp = ${exp})`), arrayView(a, { buckets }), { exp });
        for (let i = 0; i < n; i++) {
          const d = Math.floor(a[i] / exp) % 10;
          buckets[d].push(a[i]);
          r.step(5, L(`${a[i]} 의 자릿수 = ${d} → 버킷 ${d}`, `${a[i]} has digit ${d} → bucket ${d}`), arrayView(a, { colors: { [i]: 'active' }, buckets, pointers: { i } }), { exp, x: a[i], digit: d });
        }
        a = buckets.flat();
        r.step(6, L('버킷 0~9 를 순서대로 모아 배열을 다시 만듭니다.', 'Collect buckets 0–9 in order.'), arrayView(a, { buckets }), { exp });
      }
      r.step(8, L('정렬 완료!', 'Sorted!'), arrayView(a, { done: all(n) }), { n });
    });
  },
};

export const SORTING = [bubbleSort, selectionSort, insertionSort, shellSort, mergeSort, quickSort, heapSort, radixSort];
