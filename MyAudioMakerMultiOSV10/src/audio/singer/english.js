// English words for the AI singer (CONTRACT: pure). The voice bank's own dsdict-en.yaml (CMUdict
// style ARPAbet) is used first; a word it does not know is spelled out by the letter-to-sound rules
// below (written for this app — no third-party word list is bundled). The composer gives each note
// one syllable of a word ("mor" "ning"); groupWords() puts the syllables of a word back together.
import { splitEnglishWord } from '../../music/syllables.js';

export const ARPABET_VOWELS = new Set(['aa', 'ae', 'ah', 'ao', 'aw', 'ax', 'ay', 'eh', 'er', 'ey', 'ih', 'iy', 'ow', 'oy', 'uh', 'uw']);

const clean = (s) => String(s ?? '').toLowerCase().replace(/[^a-z']/g, '');

/**
 * Groups consecutive notes into words: [[i, j, …], …]. Syllables are joined when the joined word is
 * known to `isWord` and splitting it again gives exactly those syllables (so "mor"+"ning" join,
 * "I"+"love" do not). `linked[i]` false stops a word between note i and i+1 (a rest).
 */
export function groupWords(syllables, isWord, linked = null) {
  const groups = [];
  for (let i = 0; i < syllables.length;) {
    let take = 1;
    for (let k = Math.min(5, syllables.length - i); k >= 2; k--) {
      let ok = true;
      for (let j = i; j < i + k - 1; j++) if (linked && !linked[j]) { ok = false; break; }
      if (!ok) continue;
      const parts = syllables.slice(i, i + k);
      if (parts.some((p) => !/[a-z]/i.test(p) || /[가-힣]/.test(p))) continue;
      const word = parts.join('');
      if (!isWord(clean(word))) continue;
      const again = splitEnglishWord(word).map(clean);
      if (again.length === k && again.every((s, n) => s === clean(parts[n]))) { take = k; break; }
    }
    groups.push(Array.from({ length: take }, (_, n) => i + n));
    i += take;
  }
  return groups;
}

// Letter-to-sound rules: [pattern at the cursor, phonemes] tried in order (longest first).
const RULES = [
  ['tion', ['sh', 'ah', 'n']], ['sion', ['zh', 'ah', 'n']], ['ture', ['ch', 'er']], ['ough', ['ao']], ['augh', ['ao']],
  ['igh', ['ay']], ['eigh', ['ey']], ['tch', ['ch']], ['dge', ['jh']], ['que', ['k']], ['ph', ['f']], ['sh', ['sh']], ['ch', ['ch']],
  ['th', ['th']], ['wh', ['w']], ['ck', ['k']], ['ng', ['ng']], ['qu', ['k', 'w']], ['kn', ['n']], ['wr', ['r']],
  ['ee', ['iy']], ['ea', ['iy']], ['oo', ['uw']], ['ou', ['aw']], ['ow', ['ow']], ['ai', ['ey']], ['ay', ['ey']], ['oa', ['ow']],
  ['oi', ['oy']], ['oy', ['oy']], ['au', ['ao']], ['aw', ['ao']], ['ie', ['iy']], ['ei', ['ey']], ['ey', ['iy']], ['ue', ['uw']], ['ew', ['uw']],
  ['ar', ['aa', 'r']], ['er', ['er']], ['ir', ['er']], ['ur', ['er']], ['or', ['ao', 'r']],
  ['b', ['b']], ['c', ['k']], ['d', ['d']], ['f', ['f']], ['g', ['g']], ['h', ['hh']], ['j', ['jh']], ['k', ['k']], ['l', ['l']], ['m', ['m']],
  ['n', ['n']], ['p', ['p']], ['q', ['k']], ['r', ['r']], ['s', ['s']], ['t', ['t']], ['v', ['v']], ['w', ['w']], ['x', ['k', 's']], ['z', ['z']],
];
const LONG = { a: 'ey', e: 'iy', i: 'ay', o: 'ow', u: 'uw' };
const SHORT = { a: 'ae', e: 'eh', i: 'ih', o: 'aa', u: 'ah' };
const isV = (c) => 'aeiou'.includes(c ?? '');

/** A rough ARPAbet spelling of an unknown English word (lower-case symbols). */
export function letterToSound(word) {
  const w = clean(word).replace(/'/g, '');
  if (!w) return [];
  const out = [];
  // Silent final e makes the vowel before it long (make, time, home, cute).
  const magic = /[aeiou][^aeiouwxy]e$/.test(w) && w.length > 3;
  const body = magic ? w.slice(0, -1) : w;
  for (let i = 0; i < body.length;) {
    const c = body[i];
    if (c === 'c' && 'eiy'.includes(body[i + 1] ?? '')) { out.push('s'); i++; continue; }
    if (c === 'g' && 'eiy'.includes(body[i + 1] ?? '') && i > 0) { out.push('jh'); i++; continue; }
    if (c === 'y') {
      if (i === 0) { out.push('y'); i++; continue; }
      out.push(i === body.length - 1 ? (out.filter((p) => ARPABET_VOWELS.has(p)).length ? 'iy' : 'ay') : 'ih');
      i++;
      continue;
    }
    if (isV(c) && !RULES.some(([p]) => p.length > 1 && body.startsWith(p, i) && isV(p[0]))) {
      const lastVowel = magic && i === body.length - 2;
      const open = !isV(body[i + 1]) && isV(body[i + 2]) && i + 2 < body.length && body[i + 1] !== undefined && !'rwx'.includes(body[i + 1]);
      out.push(lastVowel ? LONG[c] : (i === body.length - 1 && c === 'e' && out.length ? '' : (open && i === 0 ? LONG[c] : SHORT[c])));
      if (!out[out.length - 1]) out.pop();
      i++;
      continue;
    }
    const rule = RULES.find(([p]) => body.startsWith(p, i));
    if (rule) { out.push(...rule[1]); i += rule[0].length; continue; }
    i++;
  }
  // Doubled consonants sound once (letter, happy).
  return out.filter((p, i) => i === 0 || p !== out[i - 1] || ARPABET_VOWELS.has(p));
}
