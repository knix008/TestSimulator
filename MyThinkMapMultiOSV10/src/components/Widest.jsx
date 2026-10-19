// A label as wide as the widest of its texts: the current one is shown, the
// others sit under it invisibly. The menu bar and the toolbar use it for
// everything whose text changes with the UI language or a setting (menu
// titles, the theme name), so the bars keep one width — and with it the
// window's minimum width (lib/backend.js syncWindowMinWidth) — whatever is
// chosen: switching 한국어/English no longer resizes the window.
import React from 'react';
import { t, tAll } from '../lib/i18n';

// texts: every text the label can show (the first is the current one), or k: a translation key (all its languages).
export function Widest({ k, params, texts, className = '' }) {
  const all = texts || tAll(k, params);
  const cur = texts ? texts[0] : t(k, params);
  return (
    <span className={`widest ${className}`}>
      <span>{cur}</span>
      {all.filter((x) => x !== cur).map((x) => <span key={x} className="ghost" aria-hidden="true">{x}</span>)}
    </span>
  );
}

export default Widest;
