import { en } from "./en";
import { ko } from "./ko";
import type { Language, Messages } from "./messages";

export const messages: Record<Language, Messages> = { en, ko };

export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

function browserLocales(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  const list = navigator.languages;
  if (list && list.length) return list;
  return navigator.language ? [navigator.language] : [];
}

/**
 * The language the desktop app starts in when the installer left none behind and nothing is stored yet,
 * so only the installer and the web app ever ask. Korean when the system asks for Korean, English otherwise.
 */
export function systemLanguage(locales: readonly string[] = browserLocales()): Language {
  return locales.some((locale) => locale.toLowerCase().startsWith("ko")) ? "ko" : "en";
}
