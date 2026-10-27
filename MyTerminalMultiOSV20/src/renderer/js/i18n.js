import en from '../shared/i18n/en.json';
import ko from '../shared/i18n/ko.json';

const locales = { en, ko };

function getByPath(obj, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] != null ? acc[part] : null), obj);
}

export class I18n {
  constructor() {
    this.lang = 'en';
    this.dict = locales.en;
  }

  async setLanguage(lang) {
    this.lang = lang === 'ko' ? 'ko' : 'en';
    this.dict = locales[this.lang] || locales.en;
    document.documentElement.lang = this.lang;
    this.applyDom();
    return this.dict;
  }

  t(key, fallback = key) {
    const value = getByPath(this.dict, key);
    return value == null ? fallback : value;
  }

  applyDom(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const text = this.t(el.getAttribute('data-i18n-title'));
      // Use only the custom tooltip (dataset.tooltip); the native `title`
      // attribute would render a second, duplicate browser tooltip.
      el.removeAttribute('title');
      el.setAttribute('aria-label', text);
      el.dataset.tooltip = text;
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
    });
  }
}
