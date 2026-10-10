// Two languages. The English text itself is the key, so a missing Korean
// entry still shows readable English instead of an identifier.
// Korean strings live in ./i18n-ko.js; test/unit/i18n.test.mjs checks that
// every t("...") call in src/ has a Korean entry.

import { KO } from "./i18n-ko.js";

let lang = "ko";
const listeners = new Set();

export function setLanguage(next) {
  lang = next === "en" ? "en" : "ko";
  document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

export function getLanguage() {
  return lang;
}

export function onLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// t("Saved {name}", {name}) — simple {placeholder} substitution.
export function t(key, vars) {
  let s = lang === "ko" ? KO[key] ?? key : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  return s;
}

// Translate every element carrying data-i18n / data-i18n-title / data-i18n-placeholder.
export function translateDom(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
}
