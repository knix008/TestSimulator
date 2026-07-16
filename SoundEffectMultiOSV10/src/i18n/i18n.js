const I18n = (() => {
  const catalogs = {};
  let locale = 'ko';
  let dict = {};

  async function load(lang) {
    if (!catalogs[lang]) {
      const res = await fetch(`./i18n/${lang}.json`);
      catalogs[lang] = await res.json();
    }
    locale = lang;
    dict = catalogs[lang];
    localStorage.setItem('ses.locale', lang);
    document.documentElement.lang = lang;
    applyDom();
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { locale: lang } }));
    return dict;
  }

  function t(key, fallback = key) {
    return dict[key] ?? catalogs.en?.[key] ?? fallback;
  }

  function applyDom() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      const value = t(key);
      if (attr) {
        el.setAttribute(attr, value);
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = value;
      } else {
        el.textContent = value;
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  function getLocale() {
    return locale;
  }

  async function init() {
    const saved = localStorage.getItem('ses.locale') || 'ko';
    await load('en');
    await load(saved);
  }

  return { init, load, t, getLocale, applyDom };
})();

export default I18n;
