// Korean and English UI text. `t('key', { n: 3 })` fills {n}; a missing key
// shows the key itself (the unit test makes sure both languages have every key
// the code uses).
import enBase from './i18n/en.js';
import enMore from './i18n/en-more.js';
import koBase from './i18n/ko.js';
import koMore from './i18n/ko-more.js';

const DICTIONARIES = { ko: { ...koBase, ...koMore }, en: { ...enBase, ...enMore } };
let language = 'ko';
const listeners = new Set();

export function systemLanguage() {
  const preferred = globalThis.navigator?.languages?.[0] ?? globalThis.navigator?.language ?? 'ko';
  return preferred.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function setLanguage(choice) {
  const next = choice === 'system' || !DICTIONARIES[choice] ? systemLanguage() : choice;
  if (next === language) return;
  language = next;
  if (globalThis.document) document.documentElement.lang = language;
  for (const listener of listeners) listener(language);
}

export const getLanguage = () => language;
export const onLanguageChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

export function t(key, vars) {
  const text = DICTIONARIES[language][key] ?? DICTIONARIES.en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] != null ? String(vars[name]) : match));
}

/** "1 photo" / "3 photos" style: keys `${key}.one` and `${key}.other`. */
export function plural(key, n, vars = {}) {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { n: n.toLocaleString(language), ...vars });
}

export const dictionaries = DICTIONARIES;
