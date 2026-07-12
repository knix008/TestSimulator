/**
 * i18n — lightweight internationalization module
 * Supports: en, ko
 */
export class I18n {
  constructor() {
    this._locale = 'en';
    this._messages = {};
    this._listeners = [];
  }

  async init(locale = 'en') {
    await this.loadLocale('en');
    await this.loadLocale('ko');
    this.setLocale(locale);
  }

  async loadLocale(locale) {
    try {
      const res = await fetch(`./locales/${locale}.json`);
      this._messages[locale] = await res.json();
    } catch (e) {
      console.warn(`[i18n] Failed to load locale: ${locale}`, e);
      this._messages[locale] = {};
    }
  }

  setLocale(locale) {
    if (!this._messages[locale]) {
      console.warn(`[i18n] Unknown locale: ${locale}`);
      return;
    }
    this._locale = locale;
    localStorage.setItem('av-editor-locale', locale);
    this._listeners.forEach(fn => fn(locale));
    this._updateDOM();
  }

  getLocale() { return this._locale; }

  t(key, params = {}) {
    const parts = key.split('.');
    let val = this._messages[this._locale] || {};
    for (const part of parts) {
      val = val?.[part];
      if (val === undefined) break;
    }
    if (typeof val !== 'string') {
      // fallback to English
      val = this._messages['en'];
      for (const part of parts) {
        val = val?.[part];
        if (val === undefined) break;
      }
    }
    if (typeof val !== 'string') return key;
    return val.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  }

  onLocaleChange(fn) {
    this._listeners.push(fn);
  }

  /** Update all DOM elements that carry data-i18n attribute */
  _updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = this.t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
      el.setAttribute('data-tooltip', this.t(el.getAttribute('data-i18n-tooltip')));
    });
    document.title = this.t('app.title');
  }
}
