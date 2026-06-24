export type AppLocale = 'ko' | 'en';

export type TranslationKey = keyof typeof import('./locales/ko').ko;

export type TranslateParams = Record<string, string | number>;

export type TranslateFn = (key: TranslationKey, params?: TranslateParams) => string;
