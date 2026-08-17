/* Internationalization module */
window.I18n = (() => {
  let _lang = 'en';
  let _translations = {};

  const _cache = {};

  async function loadLanguage(lang) {
    if (_cache[lang]) {
      _translations = _cache[lang];
      _lang = lang;
      return;
    }
    try {
      const resp = await fetch(`./i18n/${lang}.json`);
      _translations = await resp.json();
      _cache[lang] = _translations;
      _lang = lang;
    } catch (e) {
      console.error('Failed to load language:', lang, e);
    }
  }

  function t(key) {
    return _translations[key] || key;
  }

  function getLang() {
    return _lang;
  }

  function applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
  }

  function getAll() {
    return { ..._translations };
  }

  return { loadLanguage, t, getLang, applyToDOM, getAll };
})();
