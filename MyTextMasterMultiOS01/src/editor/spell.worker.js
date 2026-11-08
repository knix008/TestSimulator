// Spell checking off the main thread: Hunspell dictionaries (English, Korean) through nspell.
// Messages in: { id, type: 'check', words, languages } | { id, type: 'suggest', word } | { type: 'user', words }.
// A dictionary loads the first time a word of its script is checked (Korean is ~14 MB).
import nspell from 'nspell';

const loaders = {
  en: async () => {
    const [aff, dic] = await Promise.all([import('../../node_modules/dictionary-en/index.aff?raw'), import('../../node_modules/dictionary-en/index.dic?raw')]);
    return nspell(aff.default, dic.default);
  },
  ko: async () => {
    const [aff, dic] = await Promise.all([import('../../node_modules/dictionary-ko/index.aff?raw'), import('../../node_modules/dictionary-ko/index.dic?raw')]);
    return nspell(aff.default, dic.default);
  },
};
const spellers = {};
let user = new Set();
const known = new Map(); // word → correct?, cleared when the user dictionary changes

const scriptOf = (word) => (/[가-힣]/.test(word) ? 'ko' : 'en');

async function speller(language) {
  spellers[language] ??= loaders[language]();
  return spellers[language];
}

async function correct(word, languages) {
  if (user.has(word) || user.has(word.toLowerCase())) return true;
  if (known.has(word)) return known.get(word);
  const language = scriptOf(word);
  if (!languages.includes(language)) return true;
  const sp = await speller(language);
  // Words in capitals, CamelCase names (MyTextMaster) and words with digits are names and codes, not misspellings.
  if (language === 'en' && /[a-z][A-Z]/.test(word)) { known.set(word, true); return true; }
  const ok = sp.correct(word) || (language === 'en' && (/\d/.test(word) || /^[A-Z0-9]{2,}$/.test(word) || sp.correct(word.toLowerCase())));
  known.set(word, ok);
  return ok;
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === 'user') { user = new Set(message.words); known.clear(); return; }
    if (message.type === 'check') {
      const wrong = [];
      for (const word of message.words) if (!(await correct(word, message.languages))) wrong.push(word);
      self.postMessage({ id: message.id, wrong });
    } else if (message.type === 'suggest') {
      const sp = await speller(scriptOf(message.word));
      self.postMessage({ id: message.id, suggestions: sp.suggest(message.word).slice(0, 8) });
    }
  } catch (error) {
    self.postMessage({ id: message.id, error: String(error?.message ?? error) });
  }
};
