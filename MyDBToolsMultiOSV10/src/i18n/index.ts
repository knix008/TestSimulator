// Port of App/L.cs — a tiny string table with the same key names as
// Localization/Strings_{ko,en}.resx, usable from both React and core code.
import { useSyncExternalStore } from 'react';
import ko from './locales/ko.json';
import en from './locales/en.json';

export type Language = 'ko' | 'en';

type Table = Record<string, string>;

const TABLES: Record<Language, Table> = { ko: ko as Table, en: en as Table };

let current: Language = 'ko';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Look up `key`; falls back to Korean, then to `fallback`, then to the key.
 * Positional `{0}`-style arguments are substituted when supplied.
 */
export function t(key: string, ...args: (string | number)[]): string {
  const raw = TABLES[current][key] ?? TABLES.ko[key] ?? key;
  const text = raw.replace(/\r\n/g, '\n');
  if (args.length === 0) return text;
  return text.replace(/\{(\d+)\}/g, (m, i) => {
    const value = args[Number(i)];
    return value === undefined ? m : String(value);
  });
}

/** React hook — re-renders the component when the language changes. */
export function useT(): typeof t {
  useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  return t;
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}
