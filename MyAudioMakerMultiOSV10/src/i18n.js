// UI text in Korean and English. `t(key, params, fallback)` fills {name} placeholders. The shell's
// dictionaries live in i18n/ko.js and i18n/en.js; the music app's text (one line, both languages) in
// i18n/music.js overrides them.
import ko from './i18n/ko.js';
import en from './i18n/en.js';
import { ko as koMusic, en as enMusic } from './i18n/music.js';
import { ko as koSounds, en as enSounds } from './i18n/sounds.js';
import { ko as koVoice, en as enVoice } from './i18n/voice.js';

export const DICTIONARIES = { ko: { ...ko, ...koMusic, ...koSounds, ...koVoice }, en: { ...en, ...enMusic, ...enSounds, ...enVoice } };
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
