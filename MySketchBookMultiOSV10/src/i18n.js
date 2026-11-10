// UI text in Korean and English. `t(key, params, fallback)` fills {name}
// placeholders. The dictionaries live in i18n/ko.js and i18n/en.js.
import ko from './i18n/ko.js';
import en from './i18n/en.js';
import ko3d from './i18n/ko3d.js';
import en3d from './i18n/en3d.js';
import { ko as koExtra, en as enExtra } from './i18n/extra3d.js';
import { ko as koPrint, en as enPrint } from './i18n/print3d.js';
import { ko as koStairs, en as enStairs } from './i18n/stairs3d.js';
import { ko as koImport, en as enImport } from './i18n/import3d.js';
import { ko as koPlans, en as enPlans } from './i18n/plans3d.js';
import { ko as koStudio, en as enStudio } from './i18n/studio3d.js';

export const DICTIONARIES = { ko: { ...ko, ...ko3d, ...koExtra, ...koPrint, ...koStairs, ...koImport, ...koPlans, ...koStudio }, en: { ...en, ...en3d, ...enExtra, ...enPrint, ...enStairs, ...enImport, ...enPlans, ...enStudio } };
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
