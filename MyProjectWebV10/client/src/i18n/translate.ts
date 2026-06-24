import { en } from './locales/en';
import { ko } from './locales/ko';
import type { AppLocale, TranslateFn, TranslateParams } from './types';
import type { KoTranslationKey } from './locales/ko';

const dictionaries = { ko, en } as const;

export function translate(
  locale: AppLocale,
  key: KoTranslationKey,
  params?: TranslateParams,
): string {
  let text = dictionaries[locale][key] ?? dictionaries.ko[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
    }
  }
  return text;
}

export function createTranslate(locale: AppLocale): TranslateFn {
  return (key, params) => translate(locale, key, params);
}

const WEEKDAY_KEYS: KoTranslationKey[] = [
  'weekday.sun',
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
];

export function getWeekdayShortLabels(locale: AppLocale): string[] {
  return WEEKDAY_KEYS.map((key) => translate(locale, key));
}

export function getWorkingDayLabels(locale: AppLocale): string[] {
  return getWeekdayShortLabels(locale);
}

export function getDateLocaleTag(locale: AppLocale): string {
  return locale === 'en' ? 'en-US' : 'ko-KR';
}
