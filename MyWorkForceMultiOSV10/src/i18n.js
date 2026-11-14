// UI language. Call sites pass both sentences; the active language picks one.
let language = 'ko';

export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'ko';
  if (globalThis.document?.documentElement) document.documentElement.lang = language;
}

export const getLanguage = () => language;

export function L(ko, en) {
  return language === 'en' ? en : ko;
}

/** Display name of a catalog item (`ko` / `en` / `name`). */
export function nameOf(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (language === 'en') return item.en || item.ko || item.name || '';
  return item.ko || item.en || item.name || '';
}
