// Korean pronunciation for the AI singer (CONTRACT: pure). Each sung syllable is a Hangul block; how
// it is pronounced depends on its neighbours (연음, 경음화, 격음화, 비음화, 유음화, 자음군 단순화 …).
// variateSyllables() rewrites every syllable as it is sung, the way OpenUtau's Korean DiffSinger
// phonemizer does before it looks the syllables up in the voice bank's dictionary.
//
// Ported from OpenUtau (MIT License, Copyright (c) 2021 stakira and contributors),
// OpenUtau.Core/Util/KoreanPhonemizerUtil.cs — Separate / Merge / Variate. See THIRD-PARTY notices.
// Two deliberate differences: OpenUtau's "ㄹ비음화" branch can never fire (it tests ㄹ against the nasal
// table); here ㅁ/ㅇ + ㄹ → ㅁ/ㅇ + ㄴ (담력 → 담녁, 막론 → 망논) as that rule's comment intends. And an
// initial ㅎ after a vowel is kept (함께 해요, not 암께 애요 — standard pronunciation keeps it).

export const FIRST_CONSONANTS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export const MIDDLE_VOWELS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
export const LAST_CONSONANTS = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

const BASIC = { ㄱ: 0, ㄷ: 1, ㅂ: 2, ㅈ: 3, ㅅ: 4 };
const ASPIRATE = ['ㅋ', 'ㅌ', 'ㅍ', 'ㅊ', 'ㅌ'];
const FORTIS = ['ㄲ', 'ㄸ', 'ㅃ', 'ㅉ', 'ㅆ'];
const NASAL = new Set(['ㄴ', 'ㅇ', 'ㅁ']);
const isBasic = (c) => c in BASIC;

export const isHangulSyllable = (s) => typeof s === 'string' && s.length > 0 && s.charCodeAt(0) >= 0xac00 && s.charCodeAt(0) <= 0xd7a3;

/** '냥' → ['ㄴ', 'ㅑ', 'ㅇ'] (no final: ' '). */
export function separate(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  const last = code % 28;
  const middle = Math.floor(code / 28) % 21;
  const first = Math.floor(code / 588);
  return [FIRST_CONSONANTS[first], MIDDLE_VOWELS[middle], LAST_CONSONANTS[last]];
}

/** ['ㄴ', 'ㅑ', 'ㅇ'] → '냥'. */
export function merge([first, middle, last]) {
  const f = FIRST_CONSONANTS.indexOf(first === ' ' ? 'ㅇ' : first);
  const m = MIDDLE_VOWELS.indexOf(middle);
  const l = LAST_CONSONANTS.indexOf(last ?? ' ');
  return String.fromCharCode(0xac00 + (f * 21 + m) * 28 + Math.max(0, l));
}

/** Sound changes between two syllables: returns both, changed ([a, b] separated). */
export function variatePair(a, b) {
  let fl = a[2]; // first syllable's final
  let nf = b[0]; // next syllable's initial
  // 1. 연음 + ㅎ탈락
  if (fl !== ' ' && nf === 'ㅎ') {
    if (isBasic(fl)) { nf = ASPIRATE[BASIC[fl]]; fl = ' '; } else nf = 'ㅇ';
  }
  if (nf === 'ㅇ' && fl !== ' ') {
    const split = { ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'], ㄻ: ['ㄹ', 'ㅁ'] }[fl];
    if (split) [fl, nf] = split;
    else if (fl === 'ㅇ') { /* 받침 ㅇ does not move */ } else if (fl === 'ㅎ') fl = ' '; // ㅎ탈락: 좋아 → 조아
    else { nf = fl; fl = ' '; }
  }
  // 1. 유기음화 및 ㅎ탈락 1
  if (fl === 'ㅎ' && nf !== 'ㅅ' && isBasic(nf)) { fl = ' '; nf = ASPIRATE[BASIC[nf]]; }
  else if (fl === 'ㅎ' && nf === 'ㅇ') fl = ' ';
  else if (fl === 'ㄶ' && nf !== 'ㅅ' && isBasic(nf)) { fl = 'ㄴ'; nf = ASPIRATE[BASIC[nf]]; }
  else if (fl === 'ㅀ' && nf !== 'ㅅ' && isBasic(nf)) { fl = 'ㄹ'; nf = ASPIRATE[BASIC[nf]]; }
  // 2-1. 된소리되기 1 (겹받침 + 예사소리)
  if (['ㄳ', 'ㄵ', 'ㄽ', 'ㄾ', 'ㅄ', 'ㄼ', 'ㄺ', 'ㄿ'].includes(fl) && isBasic(nf)) nf = FORTIS[BASIC[nf]];
  // 3. 자음군 단순화 + 평파열음화 (음절의 끝소리 규칙)
  fl = endSound(fl, false);
  // 2-1. 된소리되기 2
  if (isBasic(fl) && isBasic(nf)) nf = FORTIS[BASIC[nf]];
  // 1. 유기음화 2
  if (isBasic(fl) && nf === 'ㅎ') { nf = ASPIRATE[BASIC[fl]]; fl = ' '; }
  else if (nf === 'ㅎ' && fl !== ' ') nf = 'ㅇ'; // ㅎ after a final consonant weakens (OpenUtau weakens it after a vowel too)
  // 연음 2
  if (fl !== ' ' && nf === 'ㅇ' && fl !== 'ㅇ') { nf = fl; fl = ' '; }
  // 4. 비음화
  const nasalOrL = nf !== 'ㅇ' && (NASAL.has(nf) || nf === 'ㄹ');
  if (fl === 'ㄱ' && nasalOrL) fl = 'ㅇ';
  else if (fl === 'ㄷ' && nasalOrL) fl = 'ㄴ';
  else if (fl === 'ㅂ' && nasalOrL) fl = 'ㅁ';
  // 4'. 유음화
  if (fl === 'ㄴ' && nf === 'ㄹ') fl = 'ㄹ';
  else if (fl === 'ㄹ' && nf === 'ㄴ') nf = 'ㄹ';
  // 4''. ㄹ의 비음화 (담력 → 담녁)
  if (nf === 'ㄹ' && (fl === 'ㅁ' || fl === 'ㅇ')) nf = 'ㄴ';
  // 4'''. 자음동화 (~라는 감정 → ~라능 감정), as in OpenUtau
  if (fl === 'ㄴ' && nf === 'ㄱ') fl = 'ㅇ';
  return [[a[0], a[1], fl], [nf, b[1], b[2]]];
}

/** The final consonant as it sounds at the end of a word (pair: before another syllable). */
function endSound(fl, alone) {
  if (fl === 'ㄽ' || fl === 'ㄾ' || fl === 'ㄼ' || (alone && fl === 'ㅀ')) return 'ㄹ';
  if (['ㄵ', 'ㅅ', 'ㅆ', 'ㅈ', 'ㅉ', 'ㅊ'].includes(fl) || (!alone && fl === 'ㅌ')) return 'ㄷ';
  if (['ㅃ', 'ㅍ', 'ㄿ', 'ㅄ'].includes(fl)) return 'ㅂ';
  if (['ㄲ', 'ㅋ', 'ㄺ', 'ㄳ'].includes(fl)) return 'ㄱ';
  if (fl === 'ㄻ') return 'ㅁ';
  if (alone && fl === 'ㄶ') return 'ㄴ';
  return fl;
}

/** A syllable alone at the end of a phrase: its final simplified (삵 → 삭). */
export function variateEnd(parts) {
  return [parts[0], parts[1], endSound(parts[2], true)];
}

/** How `cur` is sung between `prev` and `next` (either may be null): the changed syllable. */
export function variateSyllable(prev, cur, next) {
  if (!isHangulSyllable(cur)) return cur;
  const p = isHangulSyllable(prev) ? separate(prev) : null;
  const n = isHangulSyllable(next) ? separate(next) : null;
  let c = separate(cur);
  if (p) c = variatePair(p, c)[1];
  c = n ? variatePair(c, n)[0] : variateEnd(c);
  return merge(c);
}

/**
 * Every syllable of a run of connected notes as sung. `linked[i]` says whether syllable i joins
 * syllable i+1 (default: all joined). Non-Hangul syllables are kept and break the chain.
 */
export function variateSyllables(syllables, linked = null) {
  return syllables.map((s, i) => {
    const prev = i > 0 && (!linked || linked[i - 1]) ? syllables[i - 1] : null;
    const next = i + 1 < syllables.length && (!linked || linked[i]) ? syllables[i + 1] : null;
    return variateSyllable(prev, s, next);
  });
}
