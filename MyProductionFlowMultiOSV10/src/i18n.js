// UI text in Korean and English. `t(key, params, fallback)` fills {name}
// placeholders. Shared shell texts are in i18n/ko.js and i18n/en.js; the
// simulation's own texts (and the ones it words differently) in i18n/flow.js.
import ko from './i18n/ko.js';
import en from './i18n/en.js';
import { ko as koFlow, en as enFlow } from './i18n/flow.js';
import { ko as koFlow2, en as enFlow2 } from './i18n/flow2.js';
import { ko as koFlow3, en as enFlow3 } from './i18n/flow3.js';
import { templateTexts } from './sim/samples.js';

export const DICTIONARIES = { ko: { ...ko, ...koFlow, ...koFlow2, ...koFlow3, ...templateTexts('ko') }, en: { ...en, ...enFlow, ...enFlow2, ...enFlow3, ...templateTexts('en') } };
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
