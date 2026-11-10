import { L, record, parseKeyed, InputError, randInt } from './core.js';

const textPatternInput = (def) => ({
  default: def,
  hint: L('text: 본문 (최대 48자), pattern: 찾을 문자열 (최대 12자)', 'text: the text (up to 48 characters), pattern: what to find (up to 12)'),
  parse(input) {
    const { keys } = parseKeyed(input);
    const text = keys.text ?? '';
    const pattern = keys.pattern ?? '';
    if (!text || !pattern) throw new InputError('text 와 pattern 을 모두 입력하세요.', 'Enter both text and pattern.');
    if (text.length > 48 || pattern.length > 12) throw new InputError('text 는 48자, pattern 은 12자 이하여야 합니다.', 'text must be ≤ 48 and pattern ≤ 12 characters.');
    if (pattern.length > text.length) throw new InputError('pattern 이 text 보다 깁니다.', 'pattern is longer than text.');
    return { text, pattern };
  },
  random() {
    const alphabet = 'AB';
    const pattern = Array.from({ length: randInt(3, 4) }, () => alphabet[randInt(0, 1)]).join('');
    let text = '';
    while (text.length < 24) text += Math.random() < 0.3 ? pattern : alphabet[randInt(0, 1)];
    return `text: ${text.slice(0, 28)}\npattern: ${pattern}`;
  },
});

/** String matching view: the pattern drawn under the text at `shift`. */
function stringView({ text, pattern, shift = 0, i = null, j = null, state = null, matched = 0, found = [], aux = null, lps = null, info = null }) {
  return { kind: 'string', text, pattern, shift, i, j, state, matched, found: [...found], aux: aux ? { ...aux, values: [...aux.values], colors: { ...(aux.colors ?? {}) } } : null, lps: lps ? { ...lps } : null, info };
}

export const kmp = {
  id: 'kmp', category: 'string', view: 'string',
  name: L('KMP 문자열 검색', 'KMP String Search'),
  summary: L('실패 함수(LPS)로 되돌아가지 않고 패턴을 찾습니다.', 'Uses the failure function (LPS) to never step back in the text.'),
  description: L(
    '단순한 검색은 불일치가 나면 패턴을 한 칸만 밀고 처음부터 다시 비교합니다. **KMP(Knuth–Morris–Pratt)**는 패턴의 **LPS 표**(각 위치까지의 "접두사이면서 접미사인 가장 긴 길이")를 미리 계산해, 불일치 때 이미 일치한 부분을 버리지 않고 패턴을 크게 건너뜁니다.\n\n본문의 인덱스 i 는 절대 뒤로 가지 않으므로 O(n + m) 입니다.',
    'Naive search shifts the pattern by one after a mismatch and starts over. **KMP (Knuth–Morris–Pratt)** precomputes the pattern\'s **LPS table** (the longest proper prefix that is also a suffix at each position) so that after a mismatch it keeps what already matched and jumps ahead.\n\nThe text index i never moves backwards, so it runs in O(n + m).'),
  complexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)', space: 'O(m)' },
  traits: L('문자열 검색 · 전처리', 'String matching · Preprocessing'),
  input: textPatternInput('text: ABABDABACDABABCABAB\npattern: ABABCABAB'),
  pseudo: [
    'procedure KMP(T, P)',
    '  lps ← computeLPS(P)',
    '  i ← 0; j ← 0',
    '  while i < n',
    '    if T[i] = P[j]',
    '      i ← i + 1; j ← j + 1',
    '      if j = m: report a match at i − m; j ← lps[j − 1]',
    '    else if j > 0: j ← lps[j − 1]',
    '    else: i ← i + 1',
    'procedure computeLPS(P)',
    '  lps[0] ← 0; len ← 0; k ← 1',
    '  while k < m',
    '    if P[k] = P[len]: len ← len + 1; lps[k] ← len; k ← k + 1',
    '    else if len > 0: len ← lps[len − 1]',
    '    else: lps[k] ← 0; k ← k + 1',
  ],
  run({ text: T, pattern: P }) {
    const n = T.length;
    const m = P.length;
    return record((r) => {
      const lps = Array(m).fill(null);
      lps[0] = 0;
      let len = 0;
      let k = 1;
      const aux = (colors = {}) => ({ label: 'lps', values: lps.map((x) => (x === null ? '' : x)), colors });
      r.step(10, L('먼저 패턴의 LPS 표를 만듭니다. lps[0] = 0', "First build the pattern's LPS table. lps[0] = 0"), stringView({ text: null, pattern: P, aux: aux({ 0: 'write' }), lps: { k, len } }), { k, len });
      while (k < m) {
        const eq = P[k] === P[len];
        r.step(12, L(`P[${k}]='${P[k]}' 와 P[${len}]='${P[len]}' 비교: ${eq ? '같음' : '다름'}`, `Compare P[${k}]='${P[k]}' with P[${len}]='${P[len]}': ${eq ? 'equal' : 'different'}`), stringView({ text: null, pattern: P, aux: aux({ [k]: 'active' }), lps: { k, len, state: eq ? 'match' : 'mismatch' } }), { k, len });
        if (eq) {
          len++;
          lps[k] = len;
          r.step(12, L(`lps[${k}] ← ${len}`, `lps[${k}] ← ${len}`), stringView({ text: null, pattern: P, aux: aux({ [k]: 'write' }), lps: { k, len } }), { k, len });
          k++;
        } else if (len > 0) {
          len = lps[len - 1];
          r.step(13, L(`len ← lps[len − 1] = ${len}`, `len ← lps[len − 1] = ${len}`), stringView({ text: null, pattern: P, aux: aux({ [k]: 'active' }), lps: { k, len } }), { k, len });
        } else {
          lps[k] = 0;
          r.step(14, L(`lps[${k}] ← 0`, `lps[${k}] ← 0`), stringView({ text: null, pattern: P, aux: aux({ [k]: 'write' }), lps: { k, len } }), { k, len });
          k++;
        }
      }
      const found = [];
      let i = 0;
      let j = 0;
      r.step(2, L(`LPS 완성: [${lps.join(', ')}]. 이제 본문에서 찾습니다.`, `LPS done: [${lps.join(', ')}]. Now search the text.`), stringView({ text: T, pattern: P, shift: 0, aux: aux() }), { i, j });
      while (i < n) {
        const eq = T[i] === P[j];
        r.step(4, L(`T[${i}]='${T[i]}' 와 P[${j}]='${P[j]}' 비교`, `Compare T[${i}]='${T[i]}' with P[${j}]='${P[j]}'`), stringView({ text: T, pattern: P, shift: i - j, i, j, state: eq ? 'match' : 'mismatch', matched: j, found, aux: aux({ [j]: 'active' }) }), { i, j });
        if (eq) {
          i++;
          j++;
          if (j === m) {
            found.push(i - m);
            r.step(6, L(`일치! 위치 ${i - m}`, `Match at index ${i - m}!`), stringView({ text: T, pattern: P, shift: i - m, matched: m, found, aux: aux() }), { i, j, match: i - m });
            j = lps[j - 1];
            r.step(6, L(`j ← lps[${m - 1}] = ${j} 로 계속 찾습니다.`, `Continue with j ← lps[${m - 1}] = ${j}`), stringView({ text: T, pattern: P, shift: i - j, matched: j, found, aux: aux({ [m - 1]: 'source' }) }), { i, j });
          }
        } else if (j > 0) {
          const old = j;
          j = lps[j - 1];
          r.step(7, L(`불일치 → j ← lps[${old - 1}] = ${j} (패턴을 ${old - j}칸 이동)`, `Mismatch → j ← lps[${old - 1}] = ${j} (shift the pattern by ${old - j})`), stringView({ text: T, pattern: P, shift: i - j, matched: j, found, aux: aux({ [old - 1]: 'source' }) }), { i, j });
        } else {
          i++;
          r.step(8, L('불일치, j = 0 → 본문에서 한 칸 앞으로', 'Mismatch with j = 0 → advance in the text'), stringView({ text: T, pattern: P, shift: i, matched: 0, found, aux: aux() }), { i, j });
        }
      }
      r.step(3, found.length ? L(`검색 완료: 위치 ${found.join(', ')}`, `Done: matches at ${found.join(', ')}`) : L('검색 완료: 일치하는 곳이 없습니다.', 'Done: no match.'), stringView({ text: T, pattern: P, shift: Math.max(0, n - m), found, aux: aux(), info: found.join(', ') }), { matches: found.length });
    });
  },
};

export const rabinKarp = {
  id: 'rabin-karp', category: 'string', view: 'string',
  name: L('라빈-카프 문자열 검색', 'Rabin–Karp String Search'),
  summary: L('롤링 해시로 후보 위치를 빠르게 거릅니다.', 'Filters candidate positions with a rolling hash.'),
  description: L(
    '라빈-카프 알고리즘은 패턴과 본문의 각 창(window)을 **해시값**으로 비교합니다. 해시가 같을 때만 실제로 글자를 비교하므로 대부분의 위치를 빠르게 건너뜁니다.\n\n창을 한 칸 밀 때 맨 앞 글자를 빼고 새 글자를 더하는 **롤링 해시**로 O(1) 에 다음 해시를 구합니다. 해시가 우연히 같은 경우(충돌)도 있으므로 글자를 확인합니다. 여기서는 d = 256, q = 101 을 씁니다.',
    'Rabin–Karp compares the **hash** of the pattern with the hash of each window of the text and only compares characters when the hashes are equal, so most positions are skipped quickly.\n\nA **rolling hash** removes the leading character and adds the new one, giving the next window\'s hash in O(1). Hashes can collide by chance, so matches are verified. Here d = 256 and q = 101.'),
  complexity: { best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n·m)', space: 'O(1)' },
  traits: L('해싱 · 문자열 검색', 'Hashing · String matching'),
  input: textPatternInput('text: AABAACAADAABAABA\npattern: AABA'),
  pseudo: [
    'procedure RabinKarp(T, P)       // d = 256, q = 101',
    '  h ← d^(m−1) mod q; p ← hash(P); t ← hash(T[0..m−1])',
    '  for s ← 0 to n − m',
    '    if p = t',
    '      if T[s..s+m−1] = P: report a match at s',
    '    if s < n − m',
    '      t ← (d·(t − T[s]·h) + T[s + m]) mod q',
  ],
  run({ text: T, pattern: P }) {
    const n = T.length;
    const m = P.length;
    const d = 256;
    const q = 101;
    const code = (ch) => ch.charCodeAt(0) % 65536;
    return record((r) => {
      let h = 1;
      for (let k = 0; k < m - 1; k++) h = (h * d) % q;
      let p = 0;
      let t = 0;
      for (let k = 0; k < m; k++) { p = (d * p + code(P[k])) % q; t = (d * t + code(T[k])) % q; }
      const found = [];
      const info = (s) => L(`패턴 해시 p = ${p}, 창 해시 t = ${t}`, `pattern hash p = ${p}, window hash t = ${t}`);
      r.step(1, L(`h = ${h}, 패턴 해시 p = ${p}, 첫 창 해시 t = ${t}`, `h = ${h}, pattern hash p = ${p}, first window hash t = ${t}`), stringView({ text: T, pattern: P, shift: 0, found, info: info(0) }), { h, p, t });
      for (let s = 0; s <= n - m; s++) {
        const same = p === t;
        r.step(3, L(`s = ${s}: p(${p}) ${same ? '=' : '≠'} t(${t})`, `s = ${s}: p(${p}) ${same ? '=' : '≠'} t(${t})`), stringView({ text: T, pattern: P, shift: s, state: same ? 'match' : 'mismatch', found, info: info(s) }), { s, p, t });
        if (same) {
          let k = 0;
          while (k < m && T[s + k] === P[k]) k++;
          if (k === m) {
            found.push(s);
            r.step(4, L(`글자도 모두 같음 → 위치 ${s} 에서 일치!`, `All characters equal → match at ${s}!`), stringView({ text: T, pattern: P, shift: s, matched: m, found, info: info(s) }), { s, match: s });
          } else {
            r.step(4, L(`해시 충돌: 글자 ${k} 에서 다름 (가짜 일치)`, `Hash collision: characters differ at ${k} (spurious hit)`), stringView({ text: T, pattern: P, shift: s, i: s + k, j: k, state: 'mismatch', matched: k, found, info: info(s) }), { s });
          }
        }
        if (s < n - m) {
          const old = t;
          t = (d * (t - code(T[s]) * h) + code(T[s + m])) % q;
          if (t < 0) t += q;
          r.step(6, L(`창 이동: '${T[s]}' 빼고 '${T[s + m]}' 더함 → t = ${t}`, `Roll: drop '${T[s]}', add '${T[s + m]}' → t = ${t}`), stringView({ text: T, pattern: P, shift: s + 1, found, info: info(s + 1) }), { s, old, t });
        }
      }
      r.step(2, found.length ? L(`검색 완료: 위치 ${found.join(', ')}`, `Done: matches at ${found.join(', ')}`) : L('검색 완료: 일치하는 곳이 없습니다.', 'Done: no match.'), stringView({ text: T, pattern: P, shift: n - m, found, info: found.join(', ') }), { matches: found.length });
    });
  },
};

export const STRINGS = [kmp, rabinKarp];
