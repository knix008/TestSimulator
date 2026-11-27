// UI text in Korean and English. `t(key, params, fallback)` fills {name}
// placeholders. The shell's dictionaries live in i18n/ko.js and i18n/en.js (forked
// from MySketchBook's shell), MyHexaMaster's own texts in i18n/app-texts.js. Later parts of
// the app add theirs with registerTexts().
import ko from './i18n/ko.js';
import en from './i18n/en.js';
import { ko as koBase, en as enBase } from './i18n/base-texts.js';

export const DICTIONARIES = { ko: { ...ko, ...koBase }, en: { ...en, ...enBase } };
let language = 'ko';

/** Adds texts (e.g. a feature module's own): { ko: {…}, en: {…} }. Later keys win. */
export function registerTexts(texts) {
  Object.assign(DICTIONARIES.ko, texts?.ko ?? {});
  Object.assign(DICTIONARIES.en, texts?.en ?? {});
}

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

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
