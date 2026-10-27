// Explanations of buttons, menu items, tabs, navigation items and labels,
// keyed by the i18n key of their label (help.json: { key: { ko, en } }).
// components/TermTip.jsx finds a control's key from its visible text.
import HELP from './help.json';

export function helpOf(key, lang) {
  const h = key && HELP[key];
  return h ? h[lang] || h.en || null : null;
}

export { HELP };
