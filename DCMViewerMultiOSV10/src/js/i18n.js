/* Translations live in i18n/<lang>.js (plain script files so they load from file:// and http:// alike). */
window.I18n = (function () {
  const data = window.I18N_DATA || {};
  let lang = 'ko';

  function t(key, params) {
    const table = data[lang] || {};
    let s = table[key];
    if (s === undefined) s = (data.en || {})[key];
    if (s === undefined) return key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    return s;
  }

  function setLang(l) {
    lang = data[l] ? l : 'en';
    document.documentElement.lang = lang;
    apply();
    // pages that build text outside [data-i18n] elements (e.g. the popup window title) re-render on this
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  }

  return { t, setLang, apply, get lang() { return lang; }, languages: () => Object.keys(data) };
})();
