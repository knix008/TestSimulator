// Korean / English texts. t('key', { n: 3 }) fills {n}. A missing key shows the key itself
// (test/i18n.test.mjs checks that every key used in src/ exists in both languages).
import ko from './i18n/ko.js';
import en from './i18n/en.js';

export const LANGUAGES = { ko, en };
let current = 'ko';

export function setLanguage(language) {
  current = language === 'en' ? 'en' : 'ko';
  if (globalThis.document) globalThis.document.documentElement.lang = current;
  return current;
}

export const getLanguage = () => current;

export function t(key, vars) {
  const text = LANGUAGES[current][key] ?? LANGUAGES.ko[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
}
