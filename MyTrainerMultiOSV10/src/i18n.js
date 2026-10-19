// UI text in Korean and English. `t(key, params, fallback)` fills {name}
// placeholders. The dictionaries live in i18n/ko.js and i18n/en.js.
import ko from './i18n/ko.js';
import en from './i18n/en.js';

export const DICTIONARIES = { ko, en };
let language = 'ko';

export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'ko';
  if (globalThis.document?.documentElement) document.documentElement.lang = language;
}

export const getLanguage = () => language;

export function t(key, params = null, fallback = undefined) {
  let text = DICTIONARIES[language][key] ?? DICTIONARIES.ko[key];
  if (text == null) return fallback ?? key;
  if (params) text = text.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match));
  return text;
}
