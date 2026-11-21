// Syllables of sung words (CONTRACT: pure). Korean: one Hangul block = one sung syllable. English
// (and other Latin text): vowel groups, with the silent final "e" and common endings handled. The
// composer gives each syllable one note; the guide voice (audio/vocal.js) sings its vowel.

const HANGUL = /[가-힣]/;
const HANGUL_ALL = /[가-힣]/g;
export const isHangul = (ch) => HANGUL.test(ch);

/** Korean vowels (jungseong order) as simple sung vowels a e i o u (eo / eu sung as o / u). */
const JUNG_VOWEL = ['a', 'e', 'a', 'e', 'o', 'e', 'o', 'e', 'o', 'a', 'e', 'e', 'o', 'u', 'o', 'e', 'i', 'u', 'u', 'i', 'i'];
/** Final consonant (jongseong) count: 28 with "none". */
const JONG_COUNT = 28;

/** { initial, medial, final } indices of a Hangul block, or null. */
export function hangulParts(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return { initial: Math.floor(code / 588), medial: Math.floor((code % 588) / JONG_COUNT), final: code % JONG_COUNT };
}

/** Whether a Korean word ends in a consonant (받침) — for 을/를, 이/가, 은/는, 과/와, 으로/로. */
export function hasBatchim(word) {
  const s = String(word ?? '').trim();
  const last = s[s.length - 1];
  if (!last) return false;
  const parts = hangulParts(last);
  if (parts) return parts.final !== 0;
  // Latin and digits: read the last letter aloud (rough: consonant-ending words take the 받침 form).
  return /[bcdfgjklmnpqrstvxz0136789]$/i.test(s);
}

/** Korean particle after `word`: josa('사랑', '을/를') → '사랑을'. */
export function josa(word, pair) {
  const [withBatchim, without] = pair.split('/');
  const parts = hangulParts(String(word).slice(-1));
  // 으로/로: ㄹ 받침 takes 로.
  if (pair === '으로/로' && parts?.final === 8) return `${word}로`;
  return `${word}${hasBatchim(word) ? withBatchim : without}`;
}

/** English syllable count of one word (heuristic, good enough for setting words to notes). */
export function englishSyllables(word) {
  let w = String(word ?? '').toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/'/g, '');
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m[0]);
  w = w.replace(/^y/, '');
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/**
 * Splits an English word into sung syllables that read back as the word ("morning" → mor-ning,
 * "fire" → fire). The split points come from the vowel groups: one consonant goes with the next
 * syllable, a pair of consonants is split between them.
 */
export function splitEnglishWord(word) {
  const n = englishSyllables(word);
  if (n <= 1) return [word];
  const lower = word.toLowerCase();
  const vowelAt = (i) => /[aeiouy]/.test(lower[i] ?? '') && !(lower[i] === 'y' && i === 0);
  // Vowel groups (start, end).
  const groups = [];
  for (let i = 0; i < lower.length;) {
    if (vowelAt(i)) { let j = i; while (vowelAt(j + 1) && j - i < 1) j++; groups.push([i, j]); i = j + 1; } else i++;
  }
  // A silent final e does not make a syllable.
  while (groups.length > n && groups.length > 1) {
    const last = groups[groups.length - 1];
    if (last[0] === lower.length - 1 && lower[last[0]] === 'e') groups.pop(); else groups.splice(groups.length - 1, 1);
  }
  const cuts = [];
  for (let g = 0; g + 1 < groups.length; g++) {
    const gapStart = groups[g][1] + 1;
    const gapEnd = groups[g + 1][0];
    const gap = gapEnd - gapStart;
    cuts.push(gap <= 1 ? gapStart : gapStart + Math.floor(gap / 2));
  }
  const out = [];
  let from = 0;
  for (const c of cuts) { if (c > from) out.push(word.slice(from, c)); from = c; }
  out.push(word.slice(from));
  return out.filter(Boolean);
}

/** The sung syllables of a lyric line, in order. Punctuation is dropped; "(oh)" style asides are sung. */
export function syllabify(line) {
  const out = [];
  const text = String(line ?? '').replace(/[“”"«»「」『』…·,.!?;:~—–\-()[\]{}]/g, ' ');
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (HANGUL.test(token)) {
      for (const ch of token) {
        if (isHangul(ch)) out.push(ch);
        else if (/[a-z0-9]/i.test(ch)) out.push(ch);
      }
    } else if (/[a-z]/i.test(token)) {
      out.push(...splitEnglishWord(token));
    } else if (/\d/.test(token)) {
      out.push(...token.split(''));
    }
  }
  return out;
}

/** Number of sung syllables in a line. */
export const syllableCount = (line) => syllabify(line).length;

/** The vowel a syllable is sung on: 'a' | 'e' | 'i' | 'o' | 'u'. */
export function vowelOf(syllable) {
  const s = String(syllable ?? '');
  for (const ch of s) {
    const parts = hangulParts(ch);
    if (parts) return JUNG_VOWEL[parts.medial] ?? 'a';
  }
  const lower = s.toLowerCase();
  if (/ee|ea|ie|^i|y$/.test(lower) && !/ai|ay/.test(lower)) return 'i';
  if (/oo|ou|u|ew/.test(lower)) return /ou/.test(lower) ? 'a' : 'u';
  if (/o/.test(lower)) return 'o';
  if (/e/.test(lower) && !/e$/.test(lower)) return 'e';
  if (/i/.test(lower)) return 'a';
  return 'a';
}

/** Whether a syllable starts with a consonant sound (the guide voice adds a short burst). */
export function startsWithConsonant(syllable) {
  const ch = String(syllable ?? '')[0];
  if (!ch) return false;
  const parts = hangulParts(ch);
  if (parts) return parts.initial !== 11; // ㅇ is silent at the start
  return /[bcdfghjklmnpqrstvwxz]/i.test(ch);
}

/**
 * A rhyme key: what two line endings share when they rhyme. English: the last vowel group of the last
 * word and what follows it ("night" / "light" → "ight"). Korean: the last syllable's vowel and final
 * consonant ("사랑" / "바랑" → a+ng); the common endings (요 / 네 / 어) rhyme on their own.
 */
export function rhymeKey(line) {
  const text = String(line ?? '').replace(/[^\p{L}\p{N}\s']/gu, ' ').trim();
  if (!text) return '';
  const words = text.split(/\s+/);
  const last = words[words.length - 1];
  const ch = last[last.length - 1];
  const parts = hangulParts(ch ?? '');
  if (parts) return `k${parts.medial}.${parts.final}`;
  const lower = last.toLowerCase().replace(/[^a-z]/g, '');
  const m = /[aeiouy]+[^aeiouy]*e?$/.exec(lower);
  return m ? `e${m[0].replace(/e$/, '')}` : lower;
}

/** Korean characters in a text (to pick the lyric language). */
export const hangulShare = (text) => {
  const s = String(text ?? '');
  const letters = s.replace(/[^\p{L}]/gu, '').length;
  return letters ? (s.match(HANGUL_ALL)?.length ?? 0) / letters : 0;
};
