// Lyrics → timed phonemes for one phrase (CONTRACT: pure apart from the model call it is given).
// Korean syllables get their sung form from korean.js and are looked up in the bank's dictionary;
// English syllables are joined back into words and looked up (letter-to-sound rules otherwise).
// The phonemes of each word are spread over its notes (a vowel starts a note; the consonants before
// it are sung before the note), then the bank's duration model — or a simple rule when it has none —
// says how long each phoneme lasts inside the note grid.
//
// The distribution and alignment follow OpenUtau (MIT License, Copyright (c) 2021 stakira and
// contributors), OpenUtau.Core/DiffSinger/DiffSingerBasePhonemizer.cs (ProcessWord, ProcessPart).
import { isHangulSyllable, separate, variateSyllables } from './korean.js';
import { groupWords, letterToSound } from './english.js';
import { durationsMsToFrames, stretch } from './timing.js';

/** Lead-in before a phrase for its first consonants (ms), as OpenUtau. */
export const PHRASE_PADDING_MS = 500;
/** A rest inside a phrase at least this long is sung as silence (SP); shorter ones are legato. */
export const REST_MS = 80;

export const languageOf = (syl, fallback = 'ko') => (/[가-힣]/.test(syl) ? 'ko' : /[a-z]/i.test(syl) ? 'en' : fallback);

/**
 * A symbol the model knows, as OpenUtau's ValidatePhoneme: the symbol itself, else "<lang>/<symbol>"
 * for multi-language banks, else ''.
 */
export function validSymbol(symbol, lang, tokens, dict) {
  if (tokens.has(symbol) && (!dict || dict.isValid(symbol) || symbol === 'SP' || symbol === 'AP')) return symbol;
  const prefixed = `${lang}/${symbol}`;
  if (lang && tokens.has(prefixed)) return prefixed;
  if (tokens.has(symbol)) return symbol;
  return '';
}

/** Korean syllable → phonemes: a whole-syllable entry, else built from jamo entries (ㄱ, ㅏ, ㄱ(1)). */
export function koreanSymbols(syl, dict) {
  const hit = dict.query(syl);
  if (hit) return hit;
  if (!isHangulSyllable(syl)) return null;
  const [first, middle, last] = separate(syl);
  const parts = [];
  if (first !== 'ㅇ') { const c = dict.query(first); if (!c) return null; parts.push(...c); }
  const v = dict.query(middle);
  if (!v) return null;
  parts.push(...v);
  if (last !== ' ') { const f = dict.query(`${last}(1)`) ?? dict.query(last); if (f) parts.push(...f); }
  return parts;
}

/**
 * Words of a phrase: [{ notes, symbols, lang, found, text }]. `dicts`: { ko, en } (Dictionary), `tokens`:
 * the phoneme table of the model that times the phonemes (duration model, else acoustic).
 */
export function phraseWords(phrase, { dicts, tokens, fallbackLang = 'ko', restMs = REST_MS }) {
  const notes = phrase.notes;
  const sung = notes.map((n) => (n.syl && String(n.syl).trim()) || (fallbackLang === 'en' ? 'ah' : '아'));
  // Notes are linked when they follow without a real rest.
  const linked = notes.slice(0, -1).map((n, i) => notes[i + 1].startMs - n.endMs < restMs);
  const ko = variateSyllables(sung, linked);
  const enDict = dicts.en ?? dicts.ko;
  const groups = groupWords(sung, (w) => Boolean(enDict?.query(w)), linked);
  const words = [];
  for (const group of groups) {
    const first = group[0];
    const lang = languageOf(sung[first], fallbackLang);
    const dict = (lang === 'en' ? dicts.en : dicts.ko) ?? dicts.ko ?? dicts.en;
    let raw = null;
    let text = '';
    if (lang === 'ko') {
      text = ko[first];
      raw = dict ? koreanSymbols(text, dict) : null;
    } else if (lang === 'en') {
      text = group.map((i) => sung[i]).join('').toLowerCase().replace(/[^a-z']/g, '');
      raw = dict?.query(text) ?? dict?.query(text.replace(/'/g, '')) ?? letterToSound(text);
    }
    const symbols = (raw ?? []).map((s) => validSymbol(s, lang, tokens, dict)).filter(Boolean);
    words.push({ notes: group.map((i) => notes[i]), symbols: symbols.length ? symbols : ['SP'], found: symbols.length > 0, lang, text: text || sung[first], dict });
    // A rest after the word (inside the phrase) is sung as SP.
    const lastNote = notes[group[group.length - 1]];
    const next = notes[group[group.length - 1] + 1];
    if (next && next.startMs - lastNote.endMs >= restMs) {
      words.push({ notes: [{ startMs: lastNote.endMs, endMs: next.startMs, midi: lastNote.midi, rest: true }], symbols: ['SP'], found: true, lang, text: 'SP', rest: true, dict });
    }
  }
  return words;
}

/**
 * OpenUtau ProcessWord: the word's phonemes spread over its notes. Returns [{ positionMs, tone, phonemes }]
 * where the first item (positionMs -1) holds the consonants sung before the first note.
 */
export function spreadWord(word) {
  const dict = word.dict;
  const isVowel = (s) => s === 'SP' || s === 'AP' || (dict ? dict.isVowel(s) || dict.isVowel(s.replace(/^[a-z]{2,3}\//, '')) : /[aeiou]/.test(s));
  const isGlide = (s) => (dict ? dict.isGlide(s) || dict.isGlide(s.replace(/^[a-z]{2,3}\//, '')) : false);
  const syms = word.symbols;
  const vowel = syms.map(isVowel);
  const glide = syms.map(isGlide);
  const start = new Array(syms.length).fill(false);
  if (!vowel.some(Boolean)) start[0] = true;
  for (let i = 0; i < syms.length; i++) {
    if (!vowel[i]) continue;
    if (i >= 2 && glide[i - 1] && !vowel[i - 2]) start[i - 1] = true; else start[i] = true;
  }
  const out = [{ positionMs: -1, tone: word.notes[0].midi, phonemes: [] }];
  let n = 0;
  for (let i = 0; i < syms.length; i++) {
    if (start[i] && n < word.notes.length) { out.push({ positionMs: word.notes[n].startMs, tone: word.notes[n].midi, phonemes: [] }); n++; }
    out[out.length - 1].phonemes.push(syms[i]);
  }
  return out;
}

/**
 * The phrase's phoneme groups (OpenUtau ProcessPart): [{ positionMs, tone, phonemes }], the first one
 * (lead-in SP and the first word's leading consonants) at the first note − 500 ms, the last one an
 * empty marker at the phrase end. Also wordPhIndex: where each word's phonemes start.
 */
export function phraseGroups(words) {
  const firstNote = words[0].notes[0];
  const groups = [{ positionMs: firstNote.startMs - PHRASE_PADDING_MS, tone: firstNote.midi, phonemes: ['SP'] }];
  const wordPhIndex = [1];
  for (const word of words) {
    const spread = spreadWord(word);
    groups[groups.length - 1].phonemes.push(...spread[0].phonemes);
    groups.push(...spread.slice(1));
    wordPhIndex.push(wordPhIndex[wordPhIndex.length - 1] + spread.reduce((a, g) => a + g.phonemes.length, 0));
  }
  const lastWord = words[words.length - 1];
  const lastNote = lastWord.notes[lastWord.notes.length - 1];
  groups.push({ positionMs: lastNote.endMs, tone: lastNote.midi, phonemes: [] });
  return { groups, wordPhIndex };
}

/** Linguistic-encoder word inputs from the groups: word_div (phonemes per group) and word_dur (frames). */
export function groupWordInputs(groups, frameMs) {
  const body = groups.slice(0, -1);
  const wordDiv = body.map((g) => g.phonemes.length);
  const wordDur = durationsMsToFrames(body.map((g, i) => groups[i + 1].positionMs - g.positionMs), frameMs);
  return { wordDiv, wordDur };
}

/** Durations (frames) when a bank has no duration model: consonants short, vowels take the rest. */
export function ruleDurations(groups, isVowel, frameMs) {
  const consonant = Math.max(1, Math.round(70 / frameMs));
  const out = [];
  groups.slice(0, -1).forEach((g, gi) => {
    const span = Math.max(1, (groups[gi + 1].positionMs - g.positionMs) / frameMs);
    const cons = g.phonemes.filter((p) => !isVowel(p)).length;
    const vowels = g.phonemes.length - cons;
    const consFrames = Math.min(consonant, (span * 0.4) / Math.max(1, cons));
    for (const p of g.phonemes) out.push(isVowel(p) ? Math.max(1, (span - cons * consFrames) / Math.max(1, vowels)) : consFrames);
  });
  return out;
}

/**
 * Phoneme start times from predicted durations (OpenUtau's alignment): the leading consonants keep
 * their length and end at the first note; every later run is stretched to fill its note.
 * Returns [{ phoneme, positionMs, durationMs, wordIndex }] (the lead-in SP is dropped).
 */
export function alignPhones(groups, durationFrames, frameMs) {
  const counts = groups.map((g) => g.phonemes.length);
  const flat = groups.flatMap((g) => g.phonemes);
  const points = [];
  let acc = 0;
  for (let k = 0; k + 1 < groups.length; k++) { acc += counts[k]; points.push([acc, groups[k + 1].positionMs]); }
  const positions = [];
  positions.push(...stretch(durationFrames.slice(1, points[0][0]), frameMs, points[0][1]));
  for (let k = 0; k + 1 < points.length; k++) {
    const [a, aMs] = points[k];
    const [b, bMs] = points[k + 1];
    const part = durationFrames.slice(a, b);
    const sum = part.reduce((x, y) => x + y, 0);
    const ratio = sum > 0 ? (bMs - aMs) / sum : 0;
    positions.push(...stretch(part, ratio, bMs));
  }
  const endMs = groups[groups.length - 1].positionMs;
  const phones = [];
  for (let i = 1; i < flat.length; i++) {
    const start = positions[i - 1];
    const next = i + 1 < flat.length ? positions[i] : endMs;
    phones.push({ phoneme: flat[i], positionMs: start, durationMs: Math.max(0, next - start) });
  }
  return phones;
}
