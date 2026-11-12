// Spell checking for the code editor: Hunspell (WebAssembly) with the Korean and English
// dictionaries, plus the user's own words. Only what people read is checked: comments and
// strings, never the code. Identifiers inside them (snake_case, camelCase, words with digits
// or next to "_") are left alone, since they are code too.

/** The dictionaries the app brings: Hunspell's own, as published by wooorm/dictionaries. */
export const LANGUAGES = ["ko", "en"];

/** Where the user's choices live in the app's settings. */
export function sanitizeSpell(value) {
  const spell = value && typeof value === "object" ? value : {};
  const words = Array.isArray(spell.words) ? [...new Set(spell.words.filter((word) => typeof word === "string").map((word) => word.trim()).filter((word) => word && word.length <= 64 && !/\s/.test(word)))].sort((a, b) => a.localeCompare(b)) : [];
  const languages = Array.isArray(spell.languages) ? LANGUAGES.filter((language) => spell.languages.includes(language)) : [...LANGUAGES];
  return { enabled: spell.enabled !== false, languages, words };
}

/** A word's language: Hangul is Korean, Latin letters English. */
export const languageOf = (word) => (/[가-힣]/.test(word) ? "ko" : "en");

const WORD = /[A-Za-z][A-Za-z']*[A-Za-z]|[가-힣]+/g;

/**
 * The words of `text` (a comment's or a string's), with their places: [{ from, to, word }].
 * A word that is part of an identifier is skipped: next to "_" or a digit, with an upper case
 * letter after the first (camelCase), or an escape sequence's letter ("\n" before "Hello").
 */
export function wordsOf(text, offset = 0) {
  const found = [];
  for (const match of String(text).matchAll(WORD)) {
    const word = match[0].replace(/^'+|'+$/g, "");
    const at = match.index;
    const before = text[at - 1] ?? "";
    const after = text[at + match[0].length] ?? "";
    if (/[_0-9]/.test(before) || /[_0-9]/.test(after)) continue;
    if (before === "\\") continue;
    if (/^[A-Za-z]/.test(word) && /[A-Z]/.test(word.slice(1)) && word !== word.toUpperCase()) continue;
    if (/^[A-Za-z]/.test(word) && word.length < 2) continue;
    found.push({ from: offset + at, to: offset + at + match[0].length, word });
  }
  return found;
}

/**
 * The words a speller does not know: [{ from, to, word }]. `known(word, language)` is the
 * dictionary's answer; the user's words and switched-off languages always pass.
 */
export function misspelled(words, { known, languages, userWords }) {
  const mine = new Set(userWords ?? []);
  return words.filter(({ word }) => {
    if (mine.has(word)) return false;
    const language = languageOf(word);
    if (!languages.includes(language)) return false;
    // ALLCAPS in English: the dictionary decides, as for "LVGL"; the user can add it.
    return !known(word, language);
  });
}

/** Words of a word list or a Hunspell .dic file: one a line ("word/FLAGS" keeps the word). */
export function wordsFromList(text) {
  return String(text).split(/\r?\n/).map((line) => line.split("/")[0].trim()).filter((word, index) => word && !(index === 0 && /^\d+$/.test(word)) && !/\s/.test(word) && !word.startsWith("#"));
}

/* ------------------------------------------------------------------ Hunspell */

let factoryPromise = null;
const spellers = new Map();

/**
 * The speller of a language: { spell(word), suggest(word) }, loaded once. `files(language)`
 * gives the dictionary's { aff, dic } bytes (the app fetches them, the tests read them).
 */
export async function spellerFor(language, files) {
  if (!spellers.has(language)) {
    spellers.set(language, (async () => {
      // The CommonJS build: the ESM one calls a module namespace (nanoid) as a function, which a
      // bundled page cannot do.
      factoryPromise ??= import("hunspell-asm/dist/cjs/index.js").then((module) => (module.loadModule ?? module.default.loadModule)());
      const factory = await factoryPromise;
      const { aff, dic } = await files(language);
      const affPath = factory.mountBuffer(aff, `${language}.aff`);
      const dicPath = factory.mountBuffer(dic, `${language}.dic`);
      return factory.create(affPath, dicPath);
    })());
  }
  return spellers.get(language);
}
