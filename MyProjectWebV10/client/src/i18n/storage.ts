import type { AppLocale } from './types';

export const LOCALE_STORAGE_KEY = 'myproject.ui.locale';

export function getStoredLocale(): AppLocale {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (value === 'en' || value === 'ko') return value;
  } catch {
    /* ignore */
  }
  return 'ko';
}

export function setStoredLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
