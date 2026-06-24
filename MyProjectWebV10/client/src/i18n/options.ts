import { DEPENDENCY_TYPE_OPTIONS, LINE_END_OPTIONS, LINE_STYLE_OPTIONS, PATH_STYLE_OPTIONS } from '../config/ganttViewSettings';
import type { TranslateFn } from './types';
import type { KoTranslationKey } from './locales/ko';

export function localizedDependencyTypeOptions(t: TranslateFn) {
  return DEPENDENCY_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`depType.${option.value}` as KoTranslationKey),
  }));
}

export function localizedLineStyleOptions(t: TranslateFn) {
  return LINE_STYLE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`lineStyle.${option.value}` as KoTranslationKey),
  }));
}

export function localizedLineEndOptions(t: TranslateFn) {
  return LINE_END_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`lineEnd.${option.value}` as KoTranslationKey),
  }));
}

export function localizedPathStyleOptions(t: TranslateFn) {
  return PATH_STYLE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`pathStyle.${option.value}` as KoTranslationKey),
  }));
}
