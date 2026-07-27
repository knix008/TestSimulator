import { messages } from './messages.js';

const STORAGE_KEY = 'fp3d-locale';
let currentLocale = 'ko';

export function getPreferredLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'ko' || saved === 'en') return saved;
  const lang = (navigator.language || 'en').toLowerCase();
  return lang.startsWith('ko') ? 'ko' : 'en';
}

export function getLocale() {
  return currentLocale;
}

export function t(key, vars = {}) {
  const table = messages[currentLocale] || messages.en;
  let text = table[key] ?? messages.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export function applyLocale(locale) {
  currentLocale = locale === 'en' ? 'en' : 'ko';
  document.documentElement.lang = currentLocale;
  localStorage.setItem(STORAGE_KEY, currentLocale);
  document.title = t('app.title');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const translated = t(key);
    if (el.dataset.i18nAttr === 'html') {
      el.innerHTML = translated;
    } else {
      el.textContent = translated;
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });

  document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    el.setAttribute('alt', t(el.dataset.i18nAlt));
  });

  document.dispatchEvent(new CustomEvent('localechange', { detail: { locale: currentLocale } }));
  return currentLocale;
}

export function toggleLocale() {
  return applyLocale(currentLocale === 'ko' ? 'en' : 'ko');
}

export function initLocale() {
  return applyLocale(getPreferredLocale());
}

/** Translate an error that may carry an i18n key (+ optional JSON vars). */
export function translateError(err) {
  const raw = err?.message || String(err);
  if (raw.startsWith('i18n:')) {
    try {
      const payload = JSON.parse(raw.slice(5));
      return t(payload.key, payload.vars || {});
    } catch {
      return raw;
    }
  }
  if (messages.ko[raw] || messages.en[raw]) return t(raw);
  return raw;
}

export function i18nError(key, vars = {}) {
  return new Error(`i18n:${JSON.stringify({ key, vars })}`);
}
