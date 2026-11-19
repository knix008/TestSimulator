// UI text in Korean and English. `t(key, params, fallback)` fills {name}
// placeholders. The dictionaries live in i18n/ko.js and i18n/en.js.
import koBase from './i18n/ko.js';
import enBase from './i18n/en.js';
import koNet from './i18n/net-ko.js';
import enNet from './i18n/net-en.js';

const ko = { ...koBase, ...koNet };
const en = { ...enBase, ...enNet };

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

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
