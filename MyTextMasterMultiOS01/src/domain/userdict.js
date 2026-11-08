// The user's own dictionary: words the spell checker accepts (localStorage), one per entry,
// kept sorted and without duplicates. Export / import as plain text, one word per line.
const KEY = 'mytextmaster.userDictionary';
const MAX_WORD = 64;

export const cleanWord = (word) => String(word ?? '').trim().slice(0, MAX_WORD);
export const isWord = (word) => /^[\p{L}\p{N}][\p{L}\p{N}'’_-]*$/u.test(cleanWord(word));

export function addWords(list, words) {
  const set = new Set(list);
  for (const word of words) { const w = cleanWord(word); if (isWord(w)) set.add(w); }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export const removeWord = (list, word) => list.filter((w) => w !== word);

/** Words from a text file (one per line; # comments and blanks skipped). */
export const parseWordList = (text) => String(text).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));

export function loadUserDictionary(storage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? addWords([], value) : [];
  } catch {
    return [];
  }
}

export function storeUserDictionary(storage, words) {
  try { storage?.setItem(KEY, JSON.stringify(words)); } catch { /* private mode */ }
}
