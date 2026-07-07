import { ko } from './ko.js';
import { en } from './en.js';

export const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
];

export const DEFAULT_LANGUAGE = 'ko';

const catalogs = { ko, en };

function getNested(obj, key) {
  return key.split('.').reduce((current, part) => current?.[part], obj);
}

export function translate(lang, key, vars = {}) {
  const catalog = catalogs[lang] || catalogs.ko;
  let text = getNested(catalog, key) ?? getNested(catalogs.ko, key) ?? key;
  if (typeof text !== 'string') return key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), String(value ?? ''));
  }
  return text;
}

export function getEnumLabel(lang, group, value) {
  return translate(lang, `${group}.${value}`, {});
}
