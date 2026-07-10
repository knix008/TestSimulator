import { strings as koStrings } from './ko.js';
import { strings as enStrings } from './en.js';

const dictionaries = {
  Korean: koStrings,
  English: enStrings
};

let currentUiLanguage = 'Korean';
const languageChangeListeners = new Set();

export const t = {};

export function onUiLanguageChange(listener) {
  languageChangeListeners.add(listener);
  return () => languageChangeListeners.delete(listener);
}

function notifyUiLanguageChange() {
  for (const listener of languageChangeListeners) {
    try {
      listener(currentUiLanguage);
    } catch {
      // Ignore listener failures so language switching always completes.
    }
  }
}

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
  notifyUiLanguageChange();
}

applyLanguage('Korean');
