import { strings as koStrings } from './ko.js';
import { strings as enStrings } from './en.js';

const dictionaries = {
  Korean: koStrings,
  English: enStrings
};

let currentUiLanguage = 'Korean';

export const t = {};

export function getUiLanguage() {
  return currentUiLanguage;
}

export function resolveUiLanguage(value) {
  if (!value) {
    return 'Korean';
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'english' || normalized === 'en') {
    return 'English';
  }
  return 'Korean';
}

export function toTemplateLanguage(uiLanguage = currentUiLanguage) {
  return resolveUiLanguage(uiLanguage) === 'English' ? 'en' : 'ko';
}

export function applyLanguage(uiLanguage) {
  currentUiLanguage = resolveUiLanguage(uiLanguage);
  const next = dictionaries[currentUiLanguage] || koStrings;
  for (const key of Object.keys(t)) {
    delete t[key];
  }
  Object.assign(t, next);
  document.documentElement.lang = toTemplateLanguage(currentUiLanguage);
}

applyLanguage('Korean');
